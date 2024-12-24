import * as cdk from "aws-cdk-lib";
import {
  AmazonLinuxCpuType,
  BlockDeviceVolume,
  CloudFormationInit,
  InitCommand,
  InitConfig,
  InitPackage,
  InitService,
  InitServiceRestartHandle,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  MachineImage,
  Peer,
  Port,
  ServiceManager,
  SubnetType,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

import { accessIpConfig, timesketchConfig } from "./config";

export class TimesketchOnAwsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, "Vpc", {
      subnetConfiguration: [
        {
          subnetType: SubnetType.PUBLIC,
          name: "public",
        },
      ],
    });

    const handle = new InitServiceRestartHandle();
    const instance = new Instance(this, "Instance", {
      vpc,
      instanceType: InstanceType.of(InstanceClass.C7I, InstanceSize.XLARGE),
      machineImage: MachineImage.latestAmazonLinux2023({
        cpuType: AmazonLinuxCpuType.X86_64,
      }),
      ebsOptimized: true,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: BlockDeviceVolume.ebs(100, { encrypted: true }),
        },
      ],
      ssmSessionPermissions: true,
      init: CloudFormationInit.fromConfigSets({
        configSets: {
          default: ['packages', 'timesketch'],
        },
        configs: {
          packages: new InitConfig([
            InitPackage.yum('git'),
            InitPackage.yum('docker'),
            InitService.enable("docker", { serviceRestartHandle: handle }),
            InitCommand.shellCommand('usermod -aG docker ec2-user'),
            InitCommand.shellCommand('newgrp docker'),
            InitCommand.shellCommand('mkdir -p /usr/local/lib/docker/cli-plugins'),
            InitCommand.shellCommand('curl -L "https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/lib/docker/cli-plugins/docker-compose'),
            InitCommand.shellCommand('chmod +x /usr/local/lib/docker/cli-plugins/docker-compose'),
          ]),
          timesketch: new InitConfig([
            InitCommand.shellCommand(
              'curl -s -o /tmp/deploy_timesketch.sh https://raw.githubusercontent.com/google/timesketch/master/contrib/deploy_timesketch.sh'
            ),
            InitCommand.shellCommand("chmod +x /tmp/deploy_timesketch.sh"),
            InitCommand.shellCommand("/tmp/deploy_timesketch.sh --start-container --skip-create-user"),

            InitService.systemdConfigFile('timesketch',{
              command: '/usr/bin/docker compose -f /timesketch/docker-compose.yml up',
              cwd: '/timesketch',
              description: 'timesketch',
            }),

            InitService.enable("timesketch", {
              serviceManager: ServiceManager.SYSTEMD
            }),

            // Create the first Timesketch user (replace USERNAME with actual username)
            InitCommand.shellCommand(
              `cd /timesketch && docker compose exec timesketch-web tsctl create-user ${timesketchConfig.USER} --password ${timesketchConfig.PASS}`
            ),

          ]),
        },
      }),
    });

    // replace your global ip address
    instance.connections.allowFrom(Peer.ipv4(accessIpConfig.IPADDR),Port.HTTP)

    new cdk.CfnOutput(this, 'url', {
      value: `http://${instance.instancePublicIp}`,
    })

  }
}
