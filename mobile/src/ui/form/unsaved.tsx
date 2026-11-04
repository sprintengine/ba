/**
 * "Discard changes?" before unsaved edits are lost: going back (the back button, the iOS swipe, Android's back), or
 * switching the detail of a split view (`UnsavedChangesScope`). The website's `useDiscardChanges` and its SaveBar's
 * Discard, with the native confirmation.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";

const TITLE = "Discard changes?";
const MESSAGE = "What you changed here hasn't been saved.";

/** Asks whether to throw away unsaved changes; resolves true to discard. */
export function confirmDiscard(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      TITLE,
      MESSAGE,
      [
        { text: "Keep editing", style: "cancel", onPress: () => resolve(false) },
        { text: "Discard", style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

type Scope = { set: (id: string, dirty: boolean) => void; dirty: () => boolean };

const ScopeContext = createContext<Scope | null>(null);

/**
 * Wraps a split view's detail: `const leave = useConfirmLeave(); … if (await leave()) setSelected(next)`. Forms
 * inside report whether they have unsaved changes through `useUnsavedChangesGuard`.
 */
export function UnsavedChangesScope({ children }: { children: ReactNode }) {
  const dirtyIds = useRef(new Set<string>());
  const scope = useMemo<Scope>(
    () => ({
      set: (id, dirty) => {
        if (dirty) dirtyIds.current.add(id);
        else dirtyIds.current.delete(id);
      },
      dirty: () => dirtyIds.current.size > 0,
    }),
    [],
  );
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>;
}

/** Resolves true when it's fine to replace the scope's detail (nothing unsaved, or the person chose Discard). */
export function useConfirmLeave(): () => Promise<boolean> {
  const scope = useContext(ScopeContext);
  return useCallback(async () => (scope?.dirty() ? confirmDiscard() : true), [scope]);
}

/**
 * Guards a form with unsaved changes. Returns `leave(fn)`: run a navigation that must not ask (after saving, the
 * form may still read dirty until it re-renders).
 *
 *   const { leave } = useUnsavedChangesGuard(form.formState.isDirty);
 *   await save(); leave(() => router.back());
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const navigation = useNavigation();
  const scope = useContext(ScopeContext);
  const id = useId();
  const bypass = useRef(false);

  useEffect(() => {
    scope?.set(id, dirty);
    // Saved (or discarded) and still here: the next unsaved edit asks again.
    if (!dirty) bypass.current = false;
    return () => scope?.set(id, false);
  }, [scope, id, dirty]);

  usePreventRemove(dirty, ({ data }) => {
    if (bypass.current) {
      navigation.dispatch(data.action);
      return;
    }
    void confirmDiscard().then((discard) => {
      if (discard) navigation.dispatch(data.action);
    });
  });

  const leave = useCallback(
    (go: () => void) => {
      bypass.current = true;
      scope?.set(id, false);
      go();
    },
    [scope, id],
  );
  return { leave };
}
