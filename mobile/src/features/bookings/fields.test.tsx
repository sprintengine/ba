import { fireEvent, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Text } from "react-native";
import { CreditCard } from "lucide-react-native";
import { renderWithProviders } from "~/test/render";
import { ChipRow, ChoiceRow, DateField, FieldGroup, MonthGrid, TimeField } from "./fields";

const TODAY = "2026-10-15"; // a Thursday

describe("MonthGrid", () => {
  it("shows the month of the chosen day, Monday first, with today marked", () => {
    const onChange = jest.fn();
    renderWithProviders(<MonthGrid value="2026-10-20" today={TODAY} onChange={onChange} testID="grid" />);
    expect(screen.getByRole("header", { name: "October 2026" })).toBeOnTheScreen();
    expect(screen.getByTestId("day-2026-10-20")).toBeSelected();
    expect(screen.getByLabelText("Thursday 15 October 2026, today")).toBeOnTheScreen();
    // 1 October 2026 is a Thursday: three empty cells lead the first week.
    expect(screen.getByTestId("day-2026-10-01")).toBeOnTheScreen();
    expect(screen.getByTestId("day-2026-10-31")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("day-2026-10-22"));
    expect(onChange).toHaveBeenCalledWith("2026-10-22");
  });

  it("doesn't offer days or months outside min and max", () => {
    const onChange = jest.fn();
    renderWithProviders(
      <MonthGrid value={null} today={TODAY} min={TODAY} max="2026-11-10" onChange={onChange} />,
    );
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
    expect(screen.getByTestId("day-2026-10-14")).toBeDisabled();
    fireEvent.press(screen.getByTestId("day-2026-10-14"));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("header", { name: "November 2026" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
    expect(screen.getByTestId("day-2026-11-11")).toBeDisabled();
    fireEvent.press(screen.getByTestId("day-2026-11-10"));
    expect(onChange).toHaveBeenCalledWith("2026-11-10");

    fireEvent.press(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByRole("header", { name: "October 2026" })).toBeOnTheScreen();
  });

  it("opens on min's month, or January 2026, with nothing else to go on", () => {
    const { unmount } = renderWithProviders(<MonthGrid value={null} min="2026-12-03" onChange={jest.fn()} />);
    expect(screen.getByRole("header", { name: "December 2026" })).toBeOnTheScreen();
    unmount();
    renderWithProviders(<MonthGrid value={null} onChange={jest.fn()} />);
    expect(screen.getByRole("header", { name: "January 2026" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeEnabled();
  });
});

function DateHarness({ initial = TODAY, min }: { initial?: string; min?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateField label="Date" value={value} onChange={setValue} today={TODAY} min={min} testID="date" />
      <Text testID="picked">{value}</Text>
    </>
  );
}

describe("DateField", () => {
  it("offers the next fortnight as chips, today first", () => {
    renderWithProviders(<DateHarness />);
    expect(screen.getByRole("radio", { name: "Thursday 15 October 2026" })).toBeChecked();
    expect(screen.getByText("Today")).toBeOnTheScreen();
    // Each chip shows its weekday and day: a fortnight has two of each weekday.
    expect(screen.getByTestId("date-2026-10-16")).toHaveTextContent("Fri 16");
    expect(screen.getByTestId("date-2026-10-23")).toHaveTextContent("Fri 23");
    expect(screen.getByTestId("date-2026-10-28")).toBeOnTheScreen();
    expect(screen.queryByTestId("date-2026-10-29")).toBeNull();
    fireEvent.press(screen.getByTestId("date-2026-10-16"));
    expect(screen.getByTestId("picked")).toHaveTextContent("2026-10-16");
    expect(screen.getByTestId("date-2026-10-16")).toBeChecked();
    expect(screen.getByText("Friday, 16 October")).toBeOnTheScreen();
  });

  it("picks another date from a month, which then leads the chips", () => {
    renderWithProviders(<DateHarness />);
    fireEvent.press(screen.getByText("Other date…"));
    expect(screen.getByText("Hide month")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Next month" }));
    fireEvent.press(screen.getByTestId("day-2026-11-20"));
    expect(screen.getByTestId("picked")).toHaveTextContent("2026-11-20");
    expect(screen.queryByTestId("day-2026-11-20")).toBeNull();
    expect(screen.getByText("Other date…")).toBeOnTheScreen();
    expect(screen.getByTestId("date-2026-11-20")).toBeChecked();
    expect(screen.getByTestId("date-2026-10-15")).toBeOnTheScreen();
    expect(screen.queryByTestId("date-2026-10-28")).toBeNull();
  });

  it("hides the month again, or when a chip is chosen", () => {
    renderWithProviders(<DateHarness />);
    fireEvent.press(screen.getByText("Other date…"));
    fireEvent.press(screen.getByText("Hide month"));
    expect(screen.queryByTestId("day-2026-10-15")).toBeNull();
    fireEvent.press(screen.getByText("Other date…"));
    fireEvent.press(screen.getByTestId("date-2026-10-17"));
    expect(screen.queryByTestId("day-2026-10-15")).toBeNull();
    expect(screen.getByTestId("picked")).toHaveTextContent("2026-10-17");
  });

  it("starts the chips at min when that is after today", () => {
    renderWithProviders(<DateHarness initial="2026-10-20" min="2026-10-20" />);
    expect(screen.queryByTestId("date-2026-10-15")).toBeNull();
    expect(screen.queryByText("Today")).toBeNull();
    expect(screen.getByTestId("date-2026-10-20")).toBeChecked();
    expect(screen.getByTestId("date-2026-11-02")).toBeOnTheScreen();
  });
});

describe("TimeField", () => {
  it("reads a time typed any way and tidies it when leaving the field", () => {
    const onChange = jest.fn();
    renderWithProviders(<TimeField label="Start time" value={null} onChange={onChange} testID="time" />);
    const input = screen.getByTestId("time");
    fireEvent.changeText(input, "930");
    expect(onChange).toHaveBeenLastCalledWith("09:30");
    fireEvent(input, "blur");
    expect(input).toHaveDisplayValue("09:30");
    fireEvent.changeText(input, "2pm");
    expect(onChange).toHaveBeenLastCalledWith("14:00");
  });

  it("says when the time can't be read, until it's typed again", () => {
    const onChange = jest.fn();
    renderWithProviders(<TimeField label="Start time" value="10:00" onChange={onChange} testID="time" />);
    const input = screen.getByTestId("time");
    expect(input).toHaveDisplayValue("10:00");
    fireEvent.changeText(input, "lunch");
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText("Enter a time like 09:30")).toBeNull();
    fireEvent(input, "blur");
    expect(screen.getByText("Enter a time like 09:30")).toBeOnTheScreen();
    expect(input).toHaveDisplayValue("lunch");
    fireEvent.changeText(input, "11");
    expect(screen.queryByText("Enter a time like 09:30")).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith("11:00");
  });

  it("shows the form's error, and no error for an empty field", () => {
    renderWithProviders(
      <TimeField
        label="Start time"
        value={null}
        onChange={jest.fn()}
        error="Enter a start time"
        testID="time"
      />,
    );
    fireEvent(screen.getByTestId("time"), "blur");
    expect(screen.getByText("Enter a start time")).toBeOnTheScreen();
  });
});

describe("ChoiceRow", () => {
  it("is a radio named by its title, detail and aside", () => {
    const onPress = jest.fn();
    renderWithProviders(
      <ChoiceRow title="Extended" detail="1 hr 30 min" aside="€95" selected={false} onPress={onPress} />,
    );
    const row = screen.getByRole("radio", { name: "Extended, 1 hr 30 min, €95" });
    expect(row).not.toBeChecked();
    fireEvent.press(row);
    expect(onPress).toHaveBeenCalled();
  });

  it("shows when chosen, and can't be chosen when disabled", () => {
    const onPress = jest.fn();
    renderWithProviders(
      <>
        <ChoiceRow title="Online" icon={CreditCard} selected onPress={onPress} />
        <ChoiceRow title="At venue" icon={CreditCard} selected={false} disabled onPress={onPress} />
      </>,
    );
    expect(screen.getByRole("radio", { name: "Online" })).toBeChecked();
    const venue = screen.getByRole("radio", { name: "At venue" });
    expect(venue).toBeDisabled();
    fireEvent.press(venue);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("ChipRow and FieldGroup", () => {
  it("groups choices as a radio group, scrolling or wrapping", () => {
    renderWithProviders(
      <>
        <ChipRow accessibilityLabel="Scrolling">
          <Text>a</Text>
        </ChipRow>
        <ChipRow accessibilityLabel="Wrapping" wrap>
          <Text>b</Text>
        </ChipRow>
      </>,
    );
    expect(screen.getByLabelText("Scrolling")).toHaveProp("accessibilityRole", "radiogroup");
    expect(screen.getByLabelText("Wrapping")).toHaveProp("accessibilityRole", "radiogroup");
  });

  it("titles a group, numbered when it's a step", () => {
    renderWithProviders(
      <>
        <FieldGroup title="Service" step={1} testID="g1">
          <Text>inside</Text>
        </FieldGroup>
        <FieldGroup title="Notes">
          <Text>more</Text>
        </FieldGroup>
      </>,
    );
    expect(screen.getByRole("header", { name: "Service" })).toBeOnTheScreen();
    expect(screen.getByTestId("g1")).toHaveTextContent("1Serviceinside");
    expect(screen.getByRole("header", { name: "Notes" })).toBeOnTheScreen();
  });
});
