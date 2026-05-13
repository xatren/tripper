"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const COUNTRY_OPTIONS = [
  "Albania", "Argentina", "Australia", "Austria", "Belgium", "Brazil", "Bulgaria",
  "Canada", "Chile", "China", "Colombia", "Croatia", "Czech Republic", "Denmark",
  "Egypt", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Iceland",
  "India", "Indonesia", "Ireland", "Israel", "Italy", "Japan", "Jordan", "Kenya",
  "Latvia", "Lithuania", "Luxembourg", "Malaysia", "Malta", "Mexico", "Morocco",
  "Netherlands", "New Zealand", "Norway", "Peru", "Poland", "Portugal", "Romania",
  "Serbia", "Singapore", "Slovakia", "Slovenia", "South Africa", "South Korea", "Spain",
  "Sweden", "Switzerland", "Thailand", "Turkey", "Ukraine", "United Arab Emirates",
  "United Kingdom", "United States", "Vietnam",
] as const;

export type TripVisibility = "members" | "followers" | "everyone";

export interface CreateTripFormValues {
  title: string;
  countries: string[];
  start_date: string;
  end_date: string;
  visibility: TripVisibility;
}

interface CreateTripDialogProps {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  error: string | null;
  onSubmit: (values: CreateTripFormValues, inviteEmails: string[]) => Promise<void>;
}

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  handler: () => void,
  active: boolean
) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent) => {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) handler();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [ref, handler, active]);
}

const inputClass =
  "w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/35";

export function CreateTripDialog({
  children,
  open,
  onOpenChange,
  loading,
  error,
  onSubmit,
}: CreateTripDialogProps) {
  const [title, setTitle] = useState("");
  const [countries, setCountries] = useState<string[]>([]);
  const [countryOpen, setCountryOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [visibility, setVisibility] = useState<TripVisibility>("followers");
  const [emailInput, setEmailInput] = useState("");
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const countryWrapRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    return COUNTRY_OPTIONS.filter(
      (c) =>
        !countries.includes(c) && (!q || c.toLowerCase().includes(q))
    ).slice(0, 12);
  }, [countryQuery, countries]);

  const closeCountryPicker = useCallback(() => {
    setCountryOpen(false);
    setCountryQuery("");
  }, []);

  useClickOutside(countryWrapRef, closeCountryPicker, countryOpen);

  const reset = useCallback(() => {
    setTitle("");
    setCountries([]);
    setCountryQuery("");
    setCountryOpen(false);
    setStartDate("");
    setEndDate("");
    setVisibility("followers");
    setEmailInput("");
    setInviteEmails([]);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const addCountry = (c: string) => {
    setCountries((prev) => (prev.includes(c) ? prev : [...prev, c]));
    setCountryQuery("");
    setCountryOpen(false);
  };

  const removeCountry = (c: string) => {
    setCountries((prev) => prev.filter((x) => x !== c));
  };

  const addEmail = () => {
    const v = emailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return;
    if (inviteEmails.includes(v)) {
      setEmailInput("");
      return;
    }
    setInviteEmails((e) => [...e, v]);
    setEmailInput("");
  };

  const canSubmit = title.trim().length > 0 && !loading;

  const handleStartPlanning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    await onSubmit(
      {
        title: title.trim(),
        countries,
        start_date: startDate || "",
        end_date: endDate || "",
        visibility,
      },
      inviteEmails
    );
  };

  const focusInvite = () => {
    emailRef.current?.focus();
    emailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-h-[95vh] max-w-[calc(100vw-1.5rem)] overflow-y-auto border-border/60 bg-muted/40 p-0 shadow-2xl sm:max-w-[920px]"
      >
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:gap-5 sm:p-6">
          <form
            onSubmit={handleStartPlanning}
            className="flex min-w-0 flex-1 flex-col rounded-xl border border-border/60 bg-card p-5 shadow-sm sm:p-6"
          >
            <div className="mb-6 flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                Trip name
              </h2>
              <DialogClose
                type="button"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Kapat"
              >
                <X className="h-5 w-5" />
              </DialogClose>
            </div>

            <label className="sr-only" htmlFor="trip-title">
              Trip name
            </label>
            <input
              id="trip-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give your trip a name.."
              className={cn(inputClass, "mb-6")}
            />

            <p className="mb-2 text-sm font-bold text-foreground">
              Which countries are you going?
            </p>
            <div ref={countryWrapRef} className="relative mb-6">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Search className="h-4 w-4" />
              </div>
              <button
                type="button"
                onClick={() => setCountryOpen((o) => !o)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border border-border bg-input py-2.5 pl-10 pr-3 text-left text-sm text-foreground outline-none transition-colors hover:border-border/80 focus:border-primary focus:ring-2 focus:ring-ring/35"
                )}
              >
                <span className={cn(countries.length === 0 && "text-muted-foreground")}>
                  {countries.length ? `${countries.length} selected` : "Select countries.."}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
              {countries.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {countries.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/80 px-2 py-0.5 text-xs text-foreground"
                    >
                      {c}
                      <button
                        type="button"
                        onClick={() => removeCountry(c)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label={`Remove ${c}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {countryOpen && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-lg border border-border bg-popover py-1 shadow-lg">
                  <input
                    value={countryQuery}
                    onChange={(e) => setCountryQuery(e.target.value)}
                    placeholder="Search…"
                    className="w-full border-b border-border bg-transparent px-3 py-2 text-sm text-popover-foreground placeholder:text-muted-foreground outline-none"
                    autoFocus
                  />
                  {filteredCountries.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No matches</p>
                  ) : (
                    filteredCountries.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => addCountry(c)}
                        className="w-full px-3 py-2 text-left text-sm text-popover-foreground hover:bg-muted"
                      >
                        {c}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
              <div>
                <p className="mb-2 text-sm font-bold text-foreground">Start date</p>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <span className="hidden pb-2.5 text-center text-muted-foreground sm:block">→</span>
              <div>
                <p className="mb-2 text-sm font-bold text-foreground">End date</p>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <p className="mb-6 text-xs italic text-muted-foreground">
              Use this date range to set the amount of days of the trip. The exact dates
              don&apos;t matter and won&apos;t be visible to your audience.
            </p>

            <p className="mb-3 text-sm font-bold text-foreground">
              Who can view your trip?
            </p>
            <div className="mb-8 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  { id: "members" as const, label: "Trip members" },
                  { id: "followers" as const, label: "My followers" },
                  { id: "everyone" as const, label: "Everyone" },
                ] as const
              ).map(({ id, label }) => {
                const active = visibility === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setVisibility(id)}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "border-primary/70 bg-primary/15 text-primary"
                        : "border-border bg-input/60 text-muted-foreground hover:border-border hover:bg-input hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {error && (
              <p className="mb-3 text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={focusInvite}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/35 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
              >
                <Plus className="h-4 w-4" />
                Invite friends
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className={cn(
                  "w-full rounded-full px-6 py-3 text-sm font-semibold transition-opacity sm:max-w-[240px] sm:ml-auto",
                  canSubmit
                    ? "bg-primary text-primary-foreground hover:opacity-95"
                    : "cursor-not-allowed bg-muted text-muted-foreground opacity-80"
                )}
              >
                {loading ? "Creating…" : "Start planning"}
              </button>
            </div>
          </form>

          <div className="flex w-full shrink-0 flex-col rounded-xl border border-border/60 bg-card p-5 shadow-sm sm:w-[300px] sm:p-6">
            <h3 className="mb-4 text-base font-bold text-foreground">
              Invite a friend to your trip
            </h3>
            <div className="relative mb-3">
              <input
                ref={emailRef}
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addEmail();
                  }
                }}
                placeholder="Enter email address"
                className={cn(inputClass, "pr-[4.5rem]")}
              />
              <button
                type="button"
                onClick={addEmail}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                Add
              </button>
            </div>
            {inviteEmails.length > 0 && (
              <ul className="max-h-32 space-y-1 overflow-auto text-xs text-muted-foreground">
                {inviteEmails.map((em) => (
                  <li
                    key={em}
                    className="flex items-center justify-between gap-2 rounded border border-border/50 bg-muted/50 px-2 py-1 text-foreground"
                  >
                    <span className="truncate">{em}</span>
                    <button
                      type="button"
                      onClick={() => setInviteEmails((list) => list.filter((x) => x !== em))}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              After you create the trip, share your invite code from the trip dashboard.
              Email invites here are saved for your reference only.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
