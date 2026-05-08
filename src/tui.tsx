/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { createSignal, onCleanup, onMount } from "solid-js";
import { readStatusSnapshot, type StatusSnapshot } from "./status/snapshot";

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 350,
    slots: {
      sidebar_content() {
        return <CSharpStatus api={api} />;
      }
    }
  });
};

function CSharpStatus(props: { api: Parameters<TuiPlugin>[0] }) {
  const [snapshot, setSnapshot] = createSignal<StatusSnapshot | undefined>();
  const root = () => props.api.state.path.worktree || props.api.state.path.directory;

  const refresh = async () => {
    const value = root();
    if (value) {
      setSnapshot(await readStatusSnapshot(value));
    }
  };

  onMount(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    const off = props.api.event.on("message.updated", () => void refresh());
    onCleanup(() => {
      clearInterval(timer);
      off();
    });
  });

  return <StatusView snapshot={snapshot()} theme={props.api.theme.current} />;
}

function StatusView(props: { snapshot: StatusSnapshot | undefined; theme: Parameters<TuiPlugin>[0]["theme"]["current"] }) {
  const status = () => props.snapshot?.status as Record<string, unknown> | undefined;
  const usage = () => status()?.usage as Usage | undefined;

  return (
    <box flexDirection="column" gap={1}>
      <text fg={props.theme.text}><b>C# Roslyn</b></text>
      <text fg={props.theme.textMuted}>{summary(status())}</text>
      <text fg={props.theme.textMuted}>updated {props.snapshot ? shortTime(props.snapshot.updatedAt) : "never"}</text>
      <UsageList title="tools" items={usage()?.tools?.top} theme={props.theme} />
      <UsageList title="lsp" items={usage()?.lspMethods?.top} theme={props.theme} />
    </box>
  );
}

function UsageList(props: { title: string; items: UsageItem[] | undefined; theme: Parameters<TuiPlugin>[0]["theme"]["current"] }) {
  return (
    <box flexDirection="column">
      <text fg={props.theme.textMuted}>{props.title}: {props.items?.length ? "" : "none"}</text>
      {(props.items ?? []).slice(0, 5).map((item) => (
        <text fg={props.theme.textMuted}>• {item.name} ×{item.count}</text>
      ))}
    </box>
  );
}

function summary(status: Record<string, unknown> | undefined) {
  if (!status) {
    return "status has not run yet";
  }

  const running = status.running === true ? "running" : "stopped";
  const initialized = status.initialized === true ? "initialized" : "not initialized";
  return `${running}, ${initialized}, open docs ${status.openDocuments ?? 0}`;
}

function shortTime(value: string) {
  return new Date(value).toLocaleTimeString();
}

type UsageItem = { name: string; count: number; lastUsedAt: string };
type Usage = { tools?: { top?: UsageItem[] }; lspMethods?: { top?: UsageItem[] } };

const plugin: TuiPluginModule & { id: string } = {
  id: "opencode-sharp-status",
  tui
};

export default plugin;
