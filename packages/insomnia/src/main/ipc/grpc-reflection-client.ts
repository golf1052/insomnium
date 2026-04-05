import { Client, ChannelCredentials, ClientDuplexStream, Metadata } from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { AnyDefinition, MethodDefinition, ServiceDefinition } from '@grpc/proto-loader';
import * as protobuf from 'protobufjs';
import * as descriptor from 'protobufjs/ext/descriptor';

import { guard } from '../../utils/guard';

interface ReflectionRequest {
  host?: string;
  list_services?: string;
  file_containing_symbol?: string;
}

interface ReflectionResponse {
  list_services_response?: {
    service?: {
      name: string;
    }[];
  };
  file_descriptor_response?: {
    file_descriptor_proto?: Uint8Array[];
  };
  error_response?: {
    error_code?: number;
    error_message?: string;
  };
}

type DescriptorRootConstructor = typeof protobuf.Root & {
  fromDescriptor(descriptorSet: descriptor.IFileDescriptorSet | protobuf.Reader | Uint8Array): protobuf.Root;
};

const reflectionProtoPath = require.resolve('@grpc/reflection/build/proto/grpc/reflection/v1alpha/reflection.proto');

const reflectionPackageDefinition = protoLoader.loadSync(reflectionProtoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const isServiceDefinition = (definition: AnyDefinition | undefined): definition is ServiceDefinition => {
  return !!definition && !('format' in definition);
};

const reflectionServiceDefinition = reflectionPackageDefinition['grpc.reflection.v1alpha.ServerReflection'];
guard(isServiceDefinition(reflectionServiceDefinition), 'Failed to load the gRPC reflection service definition');

const reflectionMethodDefinition: MethodDefinition<ReflectionRequest, ReflectionResponse> = reflectionServiceDefinition.ServerReflectionInfo;
const descriptorRoot = protobuf.Root as DescriptorRootConstructor;

export class GrpcReflectionClient {
  private readonly client: Client;

  constructor(
    address: string,
    channelCredentials: ChannelCredentials,
    private readonly metadata: Metadata,
  ) {
    this.client = new Client(address, channelCredentials);
  }

  close() {
    this.client.close();
  }

  async listServices() {
    const response = await this.sendRequest({ list_services: '*' });
    return response.list_services_response?.service?.map(({ name }) => name) || [];
  }

  async fileContainingSymbol(symbol: string): Promise<protobuf.Root> {
    const response = await this.sendRequest({ file_containing_symbol: symbol });
    const fileDescriptorProtos = response.file_descriptor_response?.file_descriptor_proto;
    guard(fileDescriptorProtos?.length, `No reflection file descriptors returned for '${symbol}'`);

    const root = descriptorRoot.fromDescriptor({
      file: fileDescriptorProtos.map(fileDescriptorProto => {
        const decodedDescriptor = descriptor.FileDescriptorProto.decode(fileDescriptorProto);
        return descriptor.FileDescriptorProto.toObject(decodedDescriptor);
      }),
    });
    root.resolveAll();
    return root;
  }

  private createStream(): ClientDuplexStream<ReflectionRequest, ReflectionResponse> {
    return this.client.makeBidiStreamRequest(
      reflectionMethodDefinition.path,
      reflectionMethodDefinition.requestSerialize,
      reflectionMethodDefinition.responseDeserialize,
      this.metadata,
    );
  }

  private sendRequest(messageRequest: Omit<ReflectionRequest, 'host'>): Promise<ReflectionResponse> {
    return new Promise((resolve, reject) => {
      const stream = this.createStream();
      let settled = false;

      const settle = (callback: () => void) => {
        if (settled) {
          return;
        }

        settled = true;
        callback();
      };

      stream.on('data', response => {
        if (response.error_response) {
          settle(() => reject(new Error(response.error_response?.error_message || 'gRPC reflection request failed')));
          return;
        }

        settle(() => resolve(response));
      });

      stream.on('error', error => {
        settle(() => reject(error));
      });

      stream.on('end', () => {
        settle(() => reject(new Error('gRPC reflection request ended without a response')));
      });

      stream.write({
        host: '',
        ...messageRequest,
      });
      stream.end();
    });
  }
}
