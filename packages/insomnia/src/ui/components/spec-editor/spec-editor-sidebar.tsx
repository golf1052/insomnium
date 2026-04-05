import React, { FC } from 'react';
import styled from 'styled-components';
import YAML, { LineCounter, isMap, isNode, isPair, isScalar, isSeq } from 'yaml';
import type { Node } from 'yaml';

import type { ApiSpec } from '../../../models/api-spec';
import { useAIContext } from '../../context/app/ai-context';

import { Button } from '../themed-button';
import { Sidebar } from './sidebar';

interface Props {
  apiSpec: ApiSpec;
  handleSetSelection: (chStart: number, chEnd: number, lineStart: number, lineEnd: number) => void;
}

type SpecPathSegment = string | number;

const getNodeKey = (node: unknown) => {
  if (isScalar(node)) {
    return node.value;
  }

  if (isNode(node)) {
    return node.toJSON();
  }

  return null;
};

const findNodeForPath = (
  root: Node | null | undefined,
  itemPath: SpecPathSegment[],
): Node | null => {
  let currentNode = root ?? null;

  for (const segment of itemPath) {
    if (!currentNode) {
      return null;
    }

    if (isMap(currentNode)) {
      const pair = currentNode.items.find(item => {
        if (!('key' in item)) {
          return false;
        }

        return getNodeKey(item.key) === segment;
      });

      const nextNode = pair?.value ?? null;
      currentNode = nextNode && isNode(nextNode) ? nextNode : null;
      continue;
    }

    if (isSeq(currentNode)) {
      if (typeof segment !== 'number') {
        return null;
      }

      const item = currentNode.items[segment];
      const nextNode = item ? (isPair(item) ? item.value : item) : null;
      currentNode = nextNode && isNode(nextNode) ? nextNode : null;
      continue;
    }

    return null;
  }

  return currentNode;
};

const findSelectionStart = (contents: string, itemPath: SpecPathSegment[]) => {
  const lineCounter = new LineCounter();
  const document = YAML.parseDocument(contents, {
    keepSourceTokens: true,
    lineCounter,
  });
  const node = findNodeForPath(document.contents, itemPath);

  if (!node?.range) {
    return null;
  }

  const { line, col } = lineCounter.linePos(node.range[0]);

  return {
    line: Math.max(line, 1),
    col: Math.max(col, 1),
  };
};

const StyledSpecEditorSidebar = styled.div`
  overflow: hidden;
  overflow-y: auto;
`;

export const SpecEditorSidebar: FC<Props> = ({ apiSpec, handleSetSelection }) => {
  const {
    generating: loading,
    generateTestsFromSpec,
    access,
  } = useAIContext();
  const onClick = (...itemPath: any[]): void => {
    const scrollPosition = { start: { line: 0, col: 0 }, end: { line: 0, col: 200 } };

    try {
      JSON.parse(apiSpec.contents);
      // Account for JSON (as string) line number shift
      scrollPosition.start.line = 1;
    } catch { }

    const itemMappedPosition = findSelectionStart(apiSpec.contents, itemPath);
    if (itemMappedPosition) {
      scrollPosition.start.line += itemMappedPosition.line;
      scrollPosition.start.col = itemMappedPosition.col;
    }
    const isServersSection = itemPath[0] === 'servers';
    if (!isServersSection) {
      scrollPosition.start.line -= 1;
    }

    scrollPosition.end.line = scrollPosition.start.line;
    // NOTE: We're subtracting 1 from everything because YAML CST uses
    //   1-based indexing and we use 0-based.
    handleSetSelection(scrollPosition.start.col - 1, scrollPosition.end.col - 1, scrollPosition.start.line - 1, scrollPosition.end.line - 1);
  };

  const specJSON = YAML.parse(apiSpec.contents);

  return (
    <StyledSpecEditorSidebar>
      <div>
        {access.enabled && (
          <Button
            variant="text"
            disabled={loading}
            style={{
              width: '100%',
              justifyContent: 'flex-start!important',
              gap: 'var(--padding-xs)',
            }}
            onClick={generateTestsFromSpec}
          >

            <span>
              Auto-generate Tests For Collection
            </span>
          </Button>
        )}
      </div>
      <Sidebar jsonData={specJSON} onClick={onClick} />
    </StyledSpecEditorSidebar>
  );
};
