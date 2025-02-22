import { extname } from "path";
import { type ITerminalOptions, type Terminal } from "xterm";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  autoComplete,
  readClipboardToTerminal,
} from "components/apps/Terminal/functions";
import {
  type FitAddon,
  type LocalEcho,
} from "components/apps/Terminal/types";
import useCommandInterpreter from "components/apps/Terminal/useCommandInterpreter";
import { type ContainerHookProps } from "components/system/Apps/AppContainer";
import extensions from "components/system/Files/FileEntry/extensions";
import { useFileSystem } from "contexts/fileSystem";
import { useProcesses } from "contexts/process";
import { useSession } from "contexts/session";
import useResizeObserver from "hooks/useResizeObserver";
import { HOME, PACKAGE_DATA, PREVENT_SCROLL } from "utils/constants";
import { getExtension, haltEvent, loadFiles } from "utils/functions";

const { license, version } = PACKAGE_DATA;

const UBUNTU_CONFIG: ITerminalOptions = {
  allowProposedApi: true,
  allowTransparency: true,
  cursorBlink: true,
  cursorStyle: "block" as const,
  fontFamily: "Ubuntu Mono, monospace",
  fontSize: 14,
  lineHeight: 1.2,
  scrollback: 10000,
  theme: {
    background: "#000000",
    black: "#000000",
    blue: "#42A5F5",
    brightBlack: "#6272A4",
    brightBlue: "#D6ACFF",
    brightCyan: "#A4FFFF",
    brightGreen: "#69FF94",
    brightMagenta: "#FF92DF",
    brightRed: "#FF6E6E",
    brightWhite: "#FFFFFF",
    brightYellow: "#FFFFA5",
    cursor: "#FFFFFF",
    cursorAccent: "#2C001E",
    cyan: "#8BE9FD",
    green: "#4FF04F",
    magenta: "#FF79C6",
    red: "#FF5555",
    white: "#F8F8F2",
    yellow: "#FFB86C",
  },
};

const PROMPT_CHARACTER = (currentDir: string): string => `:${currentDir}$ `;

export const displayLicense = `${license} License`;

export const displayVersion = (): string => {
  const { __NEXT_DATA__: { buildId } = {} } = window;
  return `${version}${buildId ? `-${buildId}` : ""}`;
};

const useTerminal = ({
  containerRef,
  id,
  loading,
  setLoading,
  url,
}: ContainerHookProps): void => {
  const {
    url: setUrl,
    processes: { [id]: { closing = false, libs = [] } = {} },
  } = useProcesses();
  const { readdir } = useFileSystem();
  const [terminal, setTerminal] = useState<Terminal>();
  const [fitAddon, setFitAddon] = useState<FitAddon>();
  const [localEcho, setLocalEcho] = useState<LocalEcho>();
  const cd = useRef((!localEcho && url && !extname(url) ? url : "") || HOME);
  const [initialCommand, setInitialCommand] = useState("");
  const [prompted, setPrompted] = useState(false);
  const processCommand = useCommandInterpreter(id, cd, terminal, localEcho);
  const autoFit = useCallback(() => fitAddon?.fit(), [fitAddon]);
  const { foregroundId } = useSession();

  const username = useRef(process.env.USER || "user");
  const hostname = useRef(window.location.hostname || "localhost");

  useEffect(() => {
    if (url) {
      if (localEcho) {
        localEcho.handleCursorInsert(url.includes(" ") ? `"${url}"` : url);
      } else {
        const fileExtension = getExtension(url);
        const { command: extCommand = "" } = extensions[fileExtension] || {};

        if (extCommand) {
          setInitialCommand(
            `${extCommand} ${url.includes(" ") ? `"${url}"` : url}`
          );
        }
      }

      setUrl(id, "");
    }
  }, [id, localEcho, setUrl, url]);

  useEffect(() => {
    loadFiles(libs).then(() => {
      if (window.Terminal) setTerminal(new window.Terminal(UBUNTU_CONFIG));
    });
  }, [libs]);

  useEffect(() => {
    if (
      terminal &&
      loading &&
      containerRef.current &&
      window.FitAddon &&
      window.LocalEchoController
    ) {
      const newFitAddon = new window.FitAddon.FitAddon();
      const newLocalEcho = new window.LocalEchoController(undefined, {
        historySize: 1000,
      });

      terminal.loadAddon(newLocalEcho);
      terminal.loadAddon(newFitAddon);
      terminal.open(containerRef.current);
      newFitAddon.fit();

      const containerElement = containerRef.current;
      if (containerElement) {
        containerElement.style.overflow = "auto";
        containerElement.style.height = "100%";
      }

      setFitAddon(newFitAddon);
      setLocalEcho(newLocalEcho);

      containerElement?.addEventListener("contextmenu", (event) => {
        haltEvent(event);
        const textSelection = terminal.getSelection();

        if (textSelection) {
          navigator.clipboard?.writeText(textSelection);
          terminal.clearSelection();
        } else {
          readClipboardToTerminal(newLocalEcho);
        }
      });

      containerElement
        ?.closest("section")
        ?.addEventListener(
          "focus",
          () => terminal?.textarea?.focus(PREVENT_SCROLL),
          { passive: true }
        );

      setLoading(false);
    }

    return () => {
      if (terminal && closing) terminal.dispose();
    };
  }, [closing, containerRef, loading, setLoading, terminal]);

  useEffect(() => {
    if (localEcho && terminal && !prompted) {
      const prompt = (): Promise<void> =>
        localEcho
          .read(
            `\r\n${username.current}@${hostname.current}${PROMPT_CHARACTER(cd.current)}`
          )
          .then((command) => processCommand.current?.(command).then(prompt));

      if (initialCommand) {
        localEcho.println(
          `\r\n${username.current}@${hostname.current}${PROMPT_CHARACTER(cd.current)}${initialCommand}\r\n`
        );
        localEcho.history.entries = [initialCommand];
        processCommand.current(initialCommand).then(prompt);
      } else {
        prompt();
      }

      setPrompted(true);
      terminal.focus();
      autoFit();

      readdir(cd.current).then((files) => autoComplete(files, localEcho));
    }
  }, [
    autoFit,
    initialCommand,
    localEcho,
    processCommand,
    prompted,
    readdir,
    terminal,
  ]);

  useLayoutEffect(() => {
    if (id === foregroundId && !loading) {
      terminal?.textarea?.focus(PREVENT_SCROLL);
    }
  }, [foregroundId, id, loading, terminal]);

  useResizeObserver(containerRef.current, autoFit);
};

export default useTerminal;
