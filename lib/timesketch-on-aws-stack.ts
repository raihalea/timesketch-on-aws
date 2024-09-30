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
  SubnetType,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

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

    // const bootHookConf = UserData.forLinux();
    // bootHookConf.addCommands('cloud-init-per once docker_options echo \'OPTIONS="${OPTIONS} --storage-opt dm.basesize=40G"\' >> /etc/sysconfig/docker');

    // const setupCommands = UserData.forLinux();
    // setupCommands.addCommands('sudo yum install awscli docker  && echo Packages installed らと > /var/tmp/setup');

    // const setupDocker = UserData.forLinux();
    // setupDocker.addCommands('sudo yum install docker && echo Packages installed らと > /var/tmp/setup');

    // const multipartUserData = new MultipartUserData();
    // // The docker has to be configured at early stage, so content type is overridden to boothook
    // multipartUserData.addPart(MultipartBody.fromUserData(bootHookConf, 'text/cloud-boothook; charset="us-ascii"'));
    // // Execute the rest of setup
    // multipartUserData.addPart(MultipartBody.fromUserData(setupCommands));

    // // new LaunchTemplate(this, '', {
    // //   userData: multipartUserData,
    // //   blockDevices: [
    // //     // Block device configuration rest
    // //   ]
    // // });

    const handle = new InitServiceRestartHandle();
    const instance = new Instance(this, "Instance", {
      vpc,
      instanceType: InstanceType.of(InstanceClass.C7G, InstanceSize.LARGE),
      machineImage: MachineImage.latestAmazonLinux2023({
        cpuType: AmazonLinuxCpuType.ARM_64,
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
            InitCommand.shellCommand('mkdir -p /usr/local/lib/docker/cli-plugins'),
            InitCommand.shellCommand('curl -L "https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/lib/docker/cli-plugins/docker-compose'),
            InitCommand.shellCommand('chmod +x /usr/local/lib/docker/cli-plugins/docker-compose'),
          ]),
          timesketch: new InitConfig([
            InitCommand.shellCommand(
              'curl -s -o /tmp/deploy_timesketch.sh https://raw.githubusercontent.com/google/timesketch/master/contrib/deploy_timesketch.sh'
            ),
            InitCommand.shellCommand("chmod +x /tmp/deploy_timesketch.sh"),
            // InitCommand.shellCommand("cd /opt && /tmp/deploy_timesketch.sh --start-container"),

            // InitService.systemdConfigFile('timesketch',{
            //   command: '/usr/bin/docker compose -p timesketch -f /opt/timesketch',
            //   cwd: '/opt/timesketch',
            //   description: 'timesketch',
            // }),

            // InitCommand.shellCommand(
            //   "cd /opt/timesketch && docker compose up -d"
            // ),

            // Create the first Timesketch user (replace <USERNAME> with actual username)
            // InitCommand.shellCommand(
            //   "cd /opt/timesketch && sudo docker-compose exec timesketch-web tsctl create-user admin"
            // ),

            // // Enable Timesketch to start on boot
            // InitCommand.shellCommand(
            //   'echo "@reboot cd /opt/timesketch && sudo docker-compose up -d" | sudo tee -a /etc/crontab'
            // ),
          ]),
        },
      }),
    });
  }
}
