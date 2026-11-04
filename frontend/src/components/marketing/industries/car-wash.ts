import { Car, CarFront, ListChecks, Plus, SquareParking, Timer, Wallet } from "lucide-react";
import type { IndustryContent } from "./types";

export const CAR_WASH: IndustryContent = {
  slug: "car-wash",
  templateKey: "car_wash",
  icon: Car,
  color: "#0369a1",
  templateLabel: "car wash",
  business: {
    name: "Gleam Car Wash",
    slug: "gleam-car-wash",
    tagline: "Hand wash and valeting, two covered bays",
    initials: "GC",
  },
  vocabulary: {
    resource: "Bay",
    resources: "Bays",
    customer: "Customer",
    customers: "Customers",
    booking: "Booking",
  },
  meta: {
    title: "Online booking for car washes and valeting",
    description:
      "Customers book a bay, choose their car size and add extras. Durations and prices adjust automatically, deposits secure the slot. Free to start, 0% platform fee.",
  },
  hero: {
    eyebrow: "For car washes and valeting",
    title: "Book a bay, priced by the size of the car.",
    description:
      "Customers pick a service and their car size, add extras like a hand wax, and pay a deposit to hold the bay. Durations and prices adjust automatically, and your bays are never double-booked.",
    points: [
      "Car size changes duration and price",
      "Add-ons that add time as well as cost",
      "Deposits now, balance on collection",
    ],
  },
  services: [
    {
      name: "Exterior wash",
      description: "Snow foam pre-wash, hand wash, wheel clean and hand dry.",
      durationMinutes: 30,
      priceCents: 1500,
      paymentMode: "full",
    },
    {
      name: "Full valet",
      description: "Exterior hand wash plus a full interior clean, windows inside and out, and door shuts.",
      durationMinutes: 90,
      priceCents: 6000,
      paymentMode: "deposit",
      depositCents: 2000,
      options: [
        {
          name: "Small car",
          description: "Hatchbacks and city cars",
          durationMinutes: 90,
          priceCents: 6000,
        },
        {
          name: "Family car",
          description: "Saloons, estates, crossovers",
          durationMinutes: 120,
          priceCents: 7500,
        },
        {
          name: "SUV / Van",
          description: "Large SUVs, 7-seaters, vans",
          durationMinutes: 150,
          priceCents: 9500,
        },
      ],
      addons: [
        { name: "Wax", description: "Hand-applied carnauba wax", extraMinutes: 20, priceCents: 2000 },
        { name: "Interior shampoo", description: "Seats and carpets", extraMinutes: 45, priceCents: 3500 },
      ],
    },
  ],
  features: [
    {
      icon: CarFront,
      title: "Priced by car size",
      body: "Small car, family car or SUV / van: each option sets its own duration and price, so a big valet blocks the bay for as long as it really takes.",
    },
    {
      icon: Plus,
      title: "Add-ons that add time",
      body: "Wax or an interior shampoo add to the price and to the booking length. Availability accounts for both.",
    },
    {
      icon: SquareParking,
      title: "Bays, not staff",
      body: "Book against Bay 1 and Bay 2 as resources. Customers see a time; you see which bay it's in.",
    },
    {
      icon: Wallet,
      title: "A deposit to hold the bay",
      body: "Take a deposit online and the balance on collection, or full payment for quick washes. Refunds follow your policy automatically.",
    },
    {
      icon: ListChecks,
      title: "Registration upfront",
      body: "A required “Vehicle registration” question means you know which car is yours before it pulls in.",
    },
    {
      icon: Timer,
      title: "Clean-up between cars",
      body: "A 10-minute buffer after each booking to reset the bay, without customers ever seeing the gap.",
    },
  ],
  preview: {
    serviceIndex: 1,
    serviceIndexes: [0, 1],
    resourceLabel: "Bay",
    resourceChoices: [],
    slots: ["08:30", "09:00", "10:30", "12:00", "13:30", "15:00"],
    questions: [
      {
        label: "Vehicle registration",
        kind: "text",
        placeholder: "e.g. 241-G-12345",
        help: "So we can recognise your car when you arrive.",
      },
    ],
    paymentNote: "Deposit now, balance on collection.",
  },
};
