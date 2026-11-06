/** /explore filter interactions (price range, distance, mobile drawer, search box, chips) and axe on each state. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { ExploreFallback, ExploreLayout } from "../explore-hero";
import { ExploreMap } from "../explore-map";
import { ExplorePage } from "../explore-page";
import { apiError, listing, mockMarketplace, page, searchCalls } from "./fixtures";
import { navigation } from "./navigation-mock";

vi.mock("next/navigation", async () => (await import("./navigation-mock")).nextNavigation);

function Route() {
  const [, , city, category] = usePathname().split("/");
  return <ExplorePage preset={{ city, category }} />;
}

function renderExplore(path = "/explore") {
  navigation.reset(path);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <Route />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const lastSearch = (api: ReturnType<typeof mockMarketplace>) => must(searchCalls(api).at(-1), "a search");
const urlPath = () => navigation.url.pathname + navigation.url.search;
/** The desktop sidebar (the mobile drawer renders the same panel when open). */
const sidebar = () => within(screen.getByRole("complementary", { name: "Filters" }));

afterEach(() => vi.unstubAllGlobals());

describe("Explore states are axe-clean", () => {
  it("with results", async () => {
    mockMarketplace({
      search: () => page([listing(), listing({ name: "Harbour Barbers", slug: "harbour" })]),
    });
    const { container } = renderExplore();
    await screen.findByRole("link", { name: "Harbour Barbers" });
    expect(screen.getByText("2 results")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("with no results, an error, and while categories load", async () => {
    mockMarketplace({ search: () => page([]) });
    const empty = renderExplore("/explore/galway");
    expect(await screen.findByText("Nothing matches yet")).toBeInTheDocument();
    await expectNoAxeViolations(empty.container);
    empty.unmount();

    mockMarketplace({ search: () => apiError(500, "INTERNAL_SERVER_ERROR", "Search is down.") });
    const failed = renderExplore();
    expect(await screen.findByText("Search is down.")).toBeInTheDocument();
    await expectNoAxeViolations(failed.container);
    failed.unmount();

    // Categories still loading: the meta request never answers.
    const api = mockMarketplace({ search: () => page([]) });
    const answer = must(api.getMockImplementation(), "marketplace stub");
    api.mockImplementation((input: RequestInfo | URL) =>
      String(input).includes("/marketplace/meta") ? new Promise<Response>(() => {}) : answer(input),
    );
    const loading = renderExplore();
    expect(screen.queryByRole("group", { name: "Categories" })).not.toBeInTheDocument();
    await expectNoAxeViolations(loading.container);
  });

  it("for the server-rendered hero and the loading fallback", async () => {
    const { container } = render(
      <ExploreLayout title="Book physios in Galway" description="Real-time availability.">
        <ExploreFallback />
        <ExploreMap listings={[]} center={null} />
      </ExploreLayout>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Book physios in Galway" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});

describe("Price range", () => {
  it("flags a max below the min and commits a valid range after typing pauses", async () => {
    const user = userEvent.setup();
    const api = mockMarketplace({ search: () => page([listing()]) });
    renderExplore();
    await screen.findByRole("link", { name: "Lumen Physiotherapy" });

    const min = sidebar().getByRole("textbox", { name: "Min price" });
    const max = sidebar().getByRole("textbox", { name: "Max price" });
    await user.type(min, "50");
    await user.type(max, "20");
    expect(max).toHaveAttribute("aria-invalid", "true");
    expect(max).toHaveAccessibleDescription("Must be at least the min");

    await user.clear(max);
    await user.type(max, "80");
    expect(max).not.toHaveAttribute("aria-invalid");
    await waitFor(() => expect(navigation.url.search).toBe("?minPrice=5000&maxPrice=8000"), {
      timeout: 2000,
    });
    await waitFor(() => expect(lastSearch(api).get("maxPrice")).toBe("8000"));
    // Only the valid range was ever committed.
    expect(navigation.replace).toHaveBeenCalledTimes(1);

    // Clear resets the panel, and the inputs follow.
    await user.click(sidebar().getByRole("button", { name: "Clear" }));
    expect(urlPath()).toBe("/explore");
    await waitFor(() => expect(min).toHaveValue(""));
    expect(max).toHaveValue("");
    expect(sidebar().queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });
});

describe("Distance", () => {
  it("only appears with a location, and changes the radius from the keyboard", async () => {
    const user = userEvent.setup();
    const api = mockMarketplace({ search: () => page([listing()]) });
    const first = renderExplore();
    await screen.findByRole("link", { name: "Lumen Physiotherapy" });
    expect(sidebar().queryByRole("combobox", { name: "Distance" })).not.toBeInTheDocument();
    first.unmount();

    renderExplore("/explore/galway");
    await screen.findByRole("link", { name: "Lumen Physiotherapy" });
    const distance = sidebar().getByRole("combobox", { name: "Distance" });
    expect(distance).toHaveTextContent("Within 20 km");
    distance.focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("option", { name: "Within 50 km" }));
    expect(urlPath()).toBe("/explore/galway?radiusKm=50");
    await waitFor(() => expect(lastSearch(api).get("radiusKm")).toBe("50"));
    expect(await screen.findByText("Within 50 km of Galway")).toBeInTheDocument();
  });
});

describe("Mobile filters", () => {
  it("counts active filters, opens a drawer with the same panel and clears it", async () => {
    const user = userEvent.setup();
    mockMarketplace({ search: () => page([listing()]) });
    renderExplore("/explore?deals=true&available=week");
    await screen.findByRole("link", { name: "Lumen Physiotherapy" });

    const trigger = screen.getByRole("button", { name: "Filters (2 active)" });
    await user.click(trigger);
    const drawer = await screen.findByRole("dialog", { name: "Filters" });
    expect(drawer).toHaveAccessibleDescription("Results update as you change them.");
    expect(within(drawer).getByRole("switch", { name: "Has deals" })).toBeChecked();
    expect(within(drawer).getByRole("radio", { name: "This week" })).toHaveAttribute("aria-checked", "true");
    await expectNoAxeViolations(document.body);

    // The keyboard inside the drawer: vaul's pointer handlers need pointer capture, which jsdom lacks.
    within(drawer).getByRole("button", { name: "Clear filters" }).focus();
    await user.keyboard("{Enter}");
    expect(urlPath()).toBe("/explore");
    expect(within(drawer).queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    within(drawer).getByRole("button", { name: "Show results" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^Filters$/ })).toBeInTheDocument();
  });
});

describe("Search box and category chips", () => {
  it("commits on Enter straight away and clears with the clear button", async () => {
    const user = userEvent.setup();
    const api = mockMarketplace({ search: () => page([listing()]) });
    renderExplore("/explore?q=massage");
    const box = await screen.findByRole("searchbox", { name: /search businesses/i });
    expect(box).toHaveValue("massage");
    expect(screen.getByRole("search")).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, "  physio {Enter}");
    expect(navigation.url.searchParams.get("q")).toBe("physio");
    await waitFor(() => expect(lastSearch(api).get("q")).toBe("physio"));

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(box).toHaveValue("");
    await waitFor(() => expect(navigation.url.searchParams.has("q")).toBe(false));
  });

  it("toggles a category from the keyboard; pressing it again shows all", async () => {
    const user = userEvent.setup();
    mockMarketplace({ search: () => page([listing()]) });
    renderExplore();
    const chips = await screen.findByRole("group", { name: "Categories" });
    expect(within(chips).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");

    within(chips).getByRole("button", { name: "Physiotherapy" }).focus();
    await user.keyboard(" ");
    expect(navigation.url.search).toBe("?category=physio");
    await user.keyboard("{Enter}");
    expect(navigation.url.search).toBe("");
    expect(within(chips).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(chips).getByRole("button", { name: "Barber" }));
    await user.click(within(chips).getByRole("button", { name: "All" }));
    expect(urlPath()).toBe("/explore");
  });

  it("hides the chips when the backend has no categories", async () => {
    mockMarketplace({ search: () => page([listing()]), meta: () => ({ categories: [], cities: [] }) });
    renderExplore();
    await screen.findByRole("link", { name: "Lumen Physiotherapy" });
    expect(screen.queryByRole("group", { name: "Categories" })).not.toBeInTheDocument();
  });
});

describe("Loading more", () => {
  it("offers a retry when the next page fails", async () => {
    const user = userEvent.setup();
    let failNext = true;
    mockMarketplace({
      search: (url) =>
        url.searchParams.get("cursor") === "c2"
          ? failNext
            ? apiError(500, "INTERNAL_SERVER_ERROR", "Page two is missing.")
            : page([listing({ name: "Harbour Barbers", slug: "harbour" })])
          : page([listing()], "c2"),
    });
    renderExplore();
    await user.click(await screen.findByRole("button", { name: "Show more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Page two is missing.");

    failNext = false;
    await user.click(within(screen.getByRole("alert")).getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("link", { name: "Harbour Barbers" })).toBeInTheDocument();
  });
});
