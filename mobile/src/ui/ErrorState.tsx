import { CloudOff, TriangleAlert } from "lucide-react-native";
import { errorMessage, isApiError } from "@shared/api/client";
import { EmptyState } from "./EmptyState";

export type ErrorStateProps = {
  error: unknown;
  /** Heading; defaults to one that fits the error (offline vs failed). */
  title?: string;
  onRetry?: () => void;
};

/**
 * A failed load, with the API's own message and a retry. "Can't reach bookanything" when offline or the backend is
 * down (the website's ErrorState copy).
 */
export function ErrorState({ error, title, onRetry }: ErrorStateProps) {
  const unavailable = isApiError(error) && error.isUnavailable;
  return (
    <EmptyState
      testID="error-state"
      icon={unavailable ? CloudOff : TriangleAlert}
      title={title ?? (unavailable ? "Can't reach bookanything" : "Something went wrong")}
      description={errorMessage(error)}
      action={onRetry ? { label: "Try again", onPress: onRetry } : undefined}
    />
  );
}
