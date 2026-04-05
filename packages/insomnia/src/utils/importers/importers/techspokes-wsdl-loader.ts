import { execFile } from 'child_process';
import { promisify } from 'util';

type TechSpokesWsdlClientModule = typeof import('@techspokes/typescript-wsdl-client');
type GenerateOpenApi = TechSpokesWsdlClientModule['generateOpenAPI'];
const execFileAsync = promisify(execFile);

const buildJestCompatibleModule = (): TechSpokesWsdlClientModule => ({
  generateOpenAPI: (async options => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { generateOpenAPI } from '@techspokes/typescript-wsdl-client';
const input = JSON.parse(process.argv[1]);
const result = await generateOpenAPI(input);
process.stdout.write(JSON.stringify(result));`,
        JSON.stringify(options),
      ],
      {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    return JSON.parse(stdout) as Awaited<ReturnType<GenerateOpenApi>>;
  }) as GenerateOpenApi,
}) as TechSpokesWsdlClientModule;

// Preserve native dynamic import for runtime use while keeping Jest's VM-based node environment working.
const nativeImport = new Function('specifier', 'return import(specifier);') as <T>(
  specifier: string
) => Promise<T>;

export const loadTechSpokesWsdlClient = () =>
  process.env.JEST_WORKER_ID
    ? Promise.resolve(buildJestCompatibleModule())
    : nativeImport<TechSpokesWsdlClientModule>('@techspokes/typescript-wsdl-client');
