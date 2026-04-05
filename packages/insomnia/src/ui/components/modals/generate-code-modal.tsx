import type { HTTPSnippetClient, HTTPSnippetTarget } from 'httpsnippet';
import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';

import { exportHarRequest } from '../../../common/har';
import { Request } from '../../../models/request';
import { CopyButton } from '../base/copy-button';
import { Dropdown, DropdownButton, DropdownItem, ItemContent } from '../base/dropdown';
import { Link } from '../base/link';
import { Modal, type ModalHandle, ModalProps } from '../base/modal';
import { ModalBody } from '../base/modal-body';
import { ModalFooter } from '../base/modal-footer';
import { ModalHeader } from '../base/modal-header';
import { CodeEditor, CodeEditorHandle } from '../codemirror/code-editor';

const defaultTarget = JSON.parse('{"key":"shell","title":"Shell","extname":".sh","default":"curl","clients":[{"key":"curl","title":"cURL","link":"http://curl.haxx.se/","description":"cURL is a command line tool and library for transferring data with URL syntax"},{"key":"httpie","title":"HTTPie","link":"http://httpie.org/","description":"a CLI, cURL-like tool for humans"},{"key":"wget","title":"Wget","link":"https://www.gnu.org/software/wget/","description":"a free software package for retrieving files using HTTP, HTTPS"}]}') as HTTPSnippetTarget;

const defaultClient = JSON.parse('{"key":"curl","title":"cURL","link":"http://curl.haxx.se/","description":"cURL is a command line tool and library for transferring data with URL syntax"}') as HTTPSnippetClient;

const MODE_MAP: Record<string, string> = {
  c: 'clike',
  java: 'clike',
  csharp: 'clike',
  node: 'javascript',
  objc: 'clike',
  ocaml: 'mllike',
};
const TO_ADD_CONTENT_LENGTH: Record<string, string[]> = {
  node: ['native'],
};

type Props = ModalProps & {
  environmentId: string;
};
export interface GenerateCodeModalOptions {
  request?: Request;
}
export interface State {
  cmd: string;
  request?: Request;
  target?: HTTPSnippetTarget;
  client?: HTTPSnippetClient;
  targets: HTTPSnippetTarget[];
}
export interface GenerateCodeModalHandle {
  show: (options: GenerateCodeModalOptions) => void;
  hide: () => void;
}

interface HTTPSnippetInstance {
  convert: (target: string, client: string) => string | null | undefined;
}

interface HTTPSnippetConstructor {
  new (har: unknown): HTTPSnippetInstance;
  availableTargets: () => HTTPSnippetTarget[];
}

interface GenerateCodeDependencies {
  exportHarRequestFn?: typeof exportHarRequest;
  loadHTTPSnippet?: () => Promise<{ default: HTTPSnippetConstructor }>;
}

export function parseStoredGenerateCodeOption<T>(storedValue: string | null, fallback: T): T {
  try {
    return storedValue ? JSON.parse(storedValue) as T : fallback;
  } catch (error) {
    return fallback;
  }
}

export const resolveGenerateCodeSelection = (
  targets: HTTPSnippetTarget[],
  target?: HTTPSnippetTarget,
  client?: HTTPSnippetClient,
) => {
  const targetOrFallback = target || targets.find(t => t.key === 'shell') as HTTPSnippetTarget;
  const clientOrFallback = client || targetOrFallback?.clients.find(t => t.key === 'curl') as HTTPSnippetClient;
  const addContentLength = Boolean((TO_ADD_CONTENT_LENGTH[targetOrFallback?.key] || []).find(c => c === clientOrFallback?.key));

  return {
    addContentLength,
    client: clientOrFallback,
    target: targetOrFallback,
  };
};

export const generateCodeSnippet = async (
  request: Request,
  environmentId: string,
  target?: HTTPSnippetTarget,
  client?: HTTPSnippetClient,
  deps: GenerateCodeDependencies = {},
): Promise<State | null> => {
  const loadHTTPSnippet = deps.loadHTTPSnippet || (() => import('httpsnippet') as Promise<{ default: HTTPSnippetConstructor }>);
  const HTTPSnippet = (await loadHTTPSnippet()).default;
  const targets = HTTPSnippet.availableTargets();
  const selection = resolveGenerateCodeSelection(targets, target, client);
  const har = await (deps.exportHarRequestFn || exportHarRequest)(
    request._id,
    environmentId,
    selection.addContentLength,
  );

  if (!har || !selection.target || !selection.client) {
    return null;
  }

  const snippet = new HTTPSnippet(har);
  const cmd = snippet.convert(selection.target.key, selection.client.key) || '';

  return {
    request,
    cmd,
    client: selection.client,
    target: selection.target,
    targets,
  };
};

export const GenerateCodeModal = forwardRef<GenerateCodeModalHandle, Props>((props, ref) => {
  const modalRef = useRef<ModalHandle>(null);
  const editorRef = useRef<CodeEditorHandle>(null);
  const storedTarget = parseStoredGenerateCodeOption(
    window.localStorage.getItem('insomnia::generateCode::target'),
    defaultTarget,
  );
  const storedClient = parseStoredGenerateCodeOption(
    window.localStorage.getItem('insomnia::generateCode::client'),
    defaultClient,
  );
  const [state, setState] = useState<State>({
    cmd: '',
    request: undefined,
    target: storedTarget,
    client: storedClient,
    targets: [],
  });

  const generateCode = useCallback(async (request: Request, target?: HTTPSnippetTarget, client?: HTTPSnippetClient) => {
    const nextState = await generateCodeSnippet(request, props.environmentId, target, client);

    if (!nextState) {
      return;
    }

    setState(nextState);
    // Save client/target for next time
    window.localStorage.setItem('insomnia::generateCode::client', JSON.stringify(nextState.client));
    window.localStorage.setItem('insomnia::generateCode::target', JSON.stringify(nextState.target));
  }, [props.environmentId]);

  useImperativeHandle(ref, () => ({
    hide: () => {
      modalRef.current?.hide();
    },
    show: options => {
      if (!options.request) {
        return;
      }
      generateCode(options.request, state.target, state.client);
      modalRef.current?.show();
    },
  }), [generateCode, state]);

  const { cmd, target, targets, client, request } = state;
  // NOTE: Just some extra precautions in case the target is messed up
  let clients: HTTPSnippetClient[] = [];
  if (target && Array.isArray(target.clients)) {
    clients = target.clients;
  }
  return (
    <Modal ref={modalRef} tall {...props}>
      <ModalHeader>Show CURL code, etc</ModalHeader>
      <ModalBody
        noScroll
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gridTemplateRows: 'auto minmax(0, 1fr)',
        }}
      >
        <div className="pad">
          <Dropdown
            aria-label='Select a target'
            triggerButton={
              <DropdownButton className="btn btn--clicky">
                {target ? target.title : 'n/a'}
                <i className="fa fa-caret-down" />
              </DropdownButton>
            }
          >
            {targets.map(target => (
              <DropdownItem
                key={target.key}
                aria-label={target.title}
              >
                <ItemContent
                  label={target.title}
                  onClick={() => {
                    const client = target.clients.find(c => c.key === target.default);
                    if (request && client) {
                      generateCode(request, target, client);
                    }
                  }}
                />
              </DropdownItem>
            ))}
          </Dropdown>
          &nbsp;&nbsp;
          <Dropdown
            aria-label='Select a client'
            triggerButton={
              <DropdownButton className="btn btn--clicky">
                {client ? client.title : 'n/a'}
                <i className="fa fa-caret-down" />
              </DropdownButton>
            }
          >
            {clients.map(client => (
              <DropdownItem
                key={client.key}
                aria-label={client.title}
              >
                <ItemContent
                  label={client.title}
                  onClick={() => request && generateCode(request, state.target, client)}
                />
              </DropdownItem>
            ))}
          </Dropdown>
          &nbsp;&nbsp;
          <CopyButton content={cmd} className="pull-right" />
        </div>
        {target && <CodeEditor
          id="generate-code-modal-content"
          placeholder="Generating code snippet..."
          className="border-top"
          key={Date.now()}
          mode={MODE_MAP[target.key] || target.key}
          ref={editorRef}
          defaultValue={cmd}
        />}
      </ModalBody>
      <ModalFooter>
        <div className="margin-left italic txt-sm">
          * Code snippets generated by&nbsp;
          <Link href="https://github.com/Kong/httpsnippet">httpsnippet</Link>
        </div>
        <button className="btn" onClick={() => modalRef.current?.hide()}>
          Done
        </button>
      </ModalFooter>
    </Modal>
  );
});
GenerateCodeModal.displayName = 'GenerateCodeModal';
