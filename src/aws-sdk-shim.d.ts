declare module '@aws-sdk/client-s3' {
  export class S3Client {
    constructor(args: any);
    send(command: any): Promise<any>;
  }
  export class PutObjectCommand {
    constructor(args: any);
  }
  export class GetObjectCommand {
    constructor(args: any);
  }
}

declare module '@aws-sdk/s3-request-presigner' {
  export function getSignedUrl(client: any, command: any, options: any): Promise<string>;
}

