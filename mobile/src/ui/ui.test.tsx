import { act, fireEvent, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Text as RNText } from "react-native";
import { Bell } from "lucide-react-native";
import { ApiError } from "@shared/api/client";
import { renderWithProviders } from "~/test/render";
import {
  Badge,
  BrandScope,
  Button,
  Checkbox,
  ErrorState,
  IconButton,
  SegmentedControl,
  Select,
  Switch,
  TextField,
  TOAST_MS,
  useTheme,
  useToast,
} from "./index";
import { brandColors } from "./theme";
import { lightColors } from "./tokens";

describe("Button", () => {
  it("is a named button that presses, and blocks presses while loading or disabled", () => {
    const onPress = jest.fn();
    const { rerender } = renderWithProviders(<Button label="Save" onPress={onPress} />);
    fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(<Button label="Save" onPress={onPress} loading />);
    expect(screen.getByRole("button", { name: "Save" })).toBeBusy();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    rerender(<Button label="Save" onPress={onPress} disabled />);
    fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("IconButton", () => {
  it("says its count to screen readers", () => {
    renderWithProviders(
      <IconButton icon={Bell} accessibilityLabel="Notifications" badge={3} onPress={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Notifications, 3 new" })).toBeOnTheScreen();
    expect(screen.getByText("3")).toBeOnTheScreen();
  });
});

describe("form controls", () => {
  it("TextField: labelled, with its error announced", () => {
    const onChangeText = jest.fn();
    renderWithProviders(<TextField label="Email" error="Enter an email" onChangeText={onChangeText} />);
    fireEvent.changeText(screen.getByLabelText("Email"), "a@b.ie");
    expect(onChangeText).toHaveBeenCalledWith("a@b.ie");
    expect(screen.getByText("Enter an email")).toBeOnTheScreen();
  });

  it("Checkbox toggles and reports its state", () => {
    const onChange = jest.fn();
    renderWithProviders(<Checkbox label="Send reminders" checked={false} onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "Send reminders" });
    expect(box).not.toBeChecked();
    fireEvent.press(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("Switch is named by its label", () => {
    const onValueChange = jest.fn();
    renderWithProviders(<Switch label="Email me" value onValueChange={onValueChange} testID="switch" />);
    fireEvent(screen.getByTestId("switch"), "valueChange", false);
    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  it("Select opens its options and picks one", () => {
    const onChange = jest.fn();
    renderWithProviders(
      <Select
        label="Role"
        value="staff"
        onChange={onChange}
        options={[
          { value: "staff", label: "Staff" },
          { value: "admin", label: "Admin", description: "Everything but billing" },
        ]}
      />,
    );
    fireEvent.press(screen.getByRole("button", { name: "Role: Staff" }));
    fireEvent.press(screen.getByRole("button", { name: "Admin, Everything but billing" }));
    expect(onChange).toHaveBeenCalledWith("admin");
  });

  it("SegmentedControl is a tab list", () => {
    const onChange = jest.fn();
    renderWithProviders(
      <SegmentedControl
        accessibilityLabel="Bookings"
        value="a"
        onChange={onChange}
        segments={[
          { value: "a", label: "Upcoming", count: 2 },
          { value: "b", label: "Past" },
        ]}
      />,
    );
    expect(screen.getByRole("tab", { name: "Upcoming 2" })).toBeSelected();
    fireEvent.press(screen.getByRole("tab", { name: "Past" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

describe("feedback", () => {
  it("Badge shows its label", () => {
    renderWithProviders(<Badge label="Confirmed" tone="success" />);
    expect(screen.getByText("Confirmed")).toBeOnTheScreen();
  });

  it("ErrorState tells offline apart and retries", () => {
    const onRetry = jest.fn();
    renderWithProviders(
      <ErrorState error={new ApiError(0, "NETWORK_ERROR", "Check your connection.")} onRetry={onRetry} />,
    );
    expect(screen.getByText("Can't reach bookanything")).toBeOnTheScreen();
    expect(screen.getByText("Check your connection.")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("toasts appear, are announced, and go away", () => {
    jest.useFakeTimers();
    const announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);
    function Trigger() {
      const toast = useToast();
      return <Button label="Go" onPress={() => toast.show("Booking cancelled")} />;
    }
    renderWithProviders(<Trigger />);
    fireEvent.press(screen.getByRole("button", { name: "Go" }));
    expect(screen.getByText("Booking cancelled")).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith("Booking cancelled");
    act(() => jest.advanceTimersByTime(TOAST_MS));
    expect(screen.queryByText("Booking cancelled")).toBeNull();
    jest.useRealTimers();
  });
});

describe("theme", () => {
  function Probe() {
    const { colors, scheme } = useTheme();
    return <RNText testID="probe">{`${scheme} ${colors.brand}`}</RNText>;
  }

  it("follows the scheme, and BrandScope swaps in a business's readable colour", () => {
    renderWithProviders(
      <>
        <Probe />
        <BrandScope color="#0e7c70">
          <Probe />
        </BrandScope>
        <BrandScope color="not a colour">
          <Probe />
        </BrandScope>
      </>,
    );
    const [plain, branded, invalid] = screen.getAllByTestId("probe");
    expect(plain).toHaveTextContent(`light ${lightColors.brand}`);
    expect(branded).toHaveTextContent(`light ${brandColors("#0e7c70", "light").brand!}`);
    expect(invalid).toHaveTextContent(`light ${lightColors.brand}`);
  });

  it("renders dark mode", () => {
    renderWithProviders(<Probe />, { scheme: "dark" });
    expect(screen.getByTestId("probe")).toHaveTextContent(/^dark /);
  });
});
