import { Converter } from '../entities';
import { convert as convertOpenApi } from './openapi-3';
import { generateOpenApiFromWsdl, looksLikeWsdl } from './techspokes-wsdl';

export const id = 'wsdl';
export const name = 'WSDL';
export const description = 'Importer for WSDL files';

export const convert: Converter = async rawData => {
  try {
    if (looksLikeWsdl(rawData)) {
      const openApiDocument = await generateOpenApiFromWsdl(rawData);
      return convertOpenApi(JSON.stringify(openApiDocument));
    }
  } catch (error) {
    console.error(error);
  }

  return null;
};
