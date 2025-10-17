"use client";

import { DisabledOverlay } from "../../../components/DisabledOverlay";
import { useSetPageTitle } from "../../../hooks/useSetPageTitle";
import { SESSION_PAGE_FILTERS } from "../../../lib/filterGroups";
import { SubHeader } from "../components/SubHeader/SubHeader";
import SessionsList from "@/components/Sessions/SessionsList";

export default function SessionsPage() {
  useSetPageTitle("Rybbit · Sessions");

  return (
    <DisabledOverlay message="Sessions" featurePath="sessions">
      <div className="p-2 md:p-4 max-w-[1300px] mx-auto space-y-3">
        <SubHeader availableFilters={SESSION_PAGE_FILTERS} />
        <SessionsList />
      </div>
    </DisabledOverlay>
  );
}
