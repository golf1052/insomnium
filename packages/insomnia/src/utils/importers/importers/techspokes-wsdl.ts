import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import type { OpenAPIV3 } from 'openapi-types';

import { loadTechSpokesWsdlClient } from './techspokes-wsdl-loader';

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" ?>';
const WSDL_ADDRESS_PATTERN = /<(?:[\w-]+:)?address\b[^>]*\blocation=(["'])(.*?)\1/i;

export const looksLikeWsdl = (rawData: string) => rawData.includes('wsdl:definition');

export const normalizeWsdlContent = (rawData: string) =>
  rawData.trimStart().startsWith('<?xml') ? rawData : `${XML_HEADER}${rawData}`;

export const extractWsdlServiceUrl = (rawData: string) => rawData.match(WSDL_ADDRESS_PATTERN)?.[2];

export const generateOpenApiFromWsdl = async (rawData: string): Promise<OpenAPIV3.Document> => {
  const tempDir = await mkdtemp(join(tmpdir(), 'insomnium-wsdl-'));
  const wsdlPath = join(tempDir, 'import.wsdl');

  try {
    await writeFile(wsdlPath, normalizeWsdlContent(rawData), 'utf8');

    const { generateOpenAPI } = await loadTechSpokesWsdlClient();
    const serviceUrl = extractWsdlServiceUrl(rawData);
    const { doc } = await generateOpenAPI({
      wsdl: wsdlPath,
      ...(serviceUrl ? { servers: [serviceUrl] } : {}),
    });

    return doc as OpenAPIV3.Document;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};
