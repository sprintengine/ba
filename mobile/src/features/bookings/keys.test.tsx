/**
 * The shortcuts with the native `BAKeyCommands` module present (an iPad build): which commands are registered as
 * screens gain and lose focus, and which handler a key press reaches.
 */
import { act, fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { Pressable, Text } from "react-native";
import { renderScreen } from "~/test/render";
import { keyCommandsAvailable, useKeyCommand, useKeyCommands, type KeyCommand } from "./keys";

type Native = {
  setCommands: jest.Mock<void, [KeyCommand[]]>;
  addListener: jest.Mock;
  press: (input: string) => void;
};

jest.mock("expo", () => {
  const actual = jest.requireActual<typeof import("expo")>("expo");
  let listener: ((e: { input: string }) => void) | null = null;
  const native = {
    setCommands: jest.fn(),
    addListener: jest.fn((_event: string, l: (e: { input: string }) => void) => {
      listener = l;
      return { remove: () => undefined };
    }),
    press: (input: string) => listener?.({ input }),
  };
  return {
    ...actual,
    __keyCommands: native,
    requireOptionalNativeModule: (name: string) =>
      name === "BAKeyCommands" ? native : actual.requireOptionalNativeModule(name),
  };
});

const native = jest.requireMock<{ __keyCommands: Native }>("expo").__keyCommands;
const latest = () => native.setCommands.mock.calls.at(-1)?.[0];

function Home({ onNew, onToday }: { onNew: () => void; onToday: () => void }) {
  useKeyCommands({
    n: { title: "New appointment", run: onNew },
    t: { title: "Go to: today", run: onToday },
  });
  return (
    <Pressable onPress={() => router.push("/detail")}>
      <Text>Home</Text>
    </Pressable>
  );
}

function Detail({ onEdit }: { onEdit: () => void }) {
  useKeyCommand("e", onEdit, "Edit");
  return <Text>Detail</Text>;
}

function Empty() {
  useKeyCommands({});
  return <Text>Empty</Text>;
}

describe("keyboard shortcuts", () => {
  beforeEach(() => native.setCommands.mockClear());

  it("registers the focused screen's commands and runs the one pressed", async () => {
    expect(keyCommandsAvailable).toBe(true);
    const onNew = jest.fn();
    const onToday = jest.fn();
    const onEdit = jest.fn();
    renderScreen(<Home onNew={onNew} onToday={onToday} />, {
      routes: { detail: () => <Detail onEdit={onEdit} /> },
    });
    expect(await screen.findByText("Home")).toBeOnTheScreen();
    expect(latest()).toEqual([
      { input: "n", title: "New appointment" },
      { input: "t", title: "Go to: today" },
    ]);
    act(() => native.press("n"));
    expect(onNew).toHaveBeenCalledTimes(1);
    act(() => native.press("x"));

    // A pushed screen's shortcuts replace its parent's…
    fireEvent.press(screen.getByText("Home"));
    expect(await screen.findByText("Detail")).toBeOnTheScreen();
    expect(latest()).toEqual([{ input: "e", title: "Edit" }]);
    act(() => native.press("e"));
    act(() => native.press("n"));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onNew).toHaveBeenCalledTimes(1);

    // …and the parent's come back when it pops.
    act(() => router.back());
    expect(await screen.findByText("Home")).toBeOnTheScreen();
    expect(latest()).toEqual([
      { input: "n", title: "New appointment" },
      { input: "t", title: "Go to: today" },
    ]);
    act(() => native.press("t"));
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it("registers no commands for a screen without any", async () => {
    renderScreen(<Empty />);
    expect(await screen.findByText("Empty")).toBeOnTheScreen();
    expect(latest()).toEqual([]);
  });
});
