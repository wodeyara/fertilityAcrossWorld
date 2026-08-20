import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { ControlPanel } from "./ControlPanel";
import type { FactorMeta } from "../types";

const factors: FactorMeta[] = [
  { id: "gdp_pc", label: "GDP per capita", group: "Economic", unit: "$", direction: "negative", source: "WB" },
  { id: "urbanisation", label: "Urbanisation", group: "Structure", unit: "%", direction: "negative", source: "WB" },
];

test("renders grouped factors and reports toggles", () => {
  const onToggle = vi.fn();
  render(
    <ControlPanel factors={factors} selected={new Set(["gdp_pc"])} onToggleFactor={onToggle}
      mode="residual" onSetMode={() => {}} r2={0.71} n={150} />,
  );
  expect(screen.getByText("Economic")).toBeInTheDocument();
  expect(screen.getByText("71%")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Urbanisation"));
  expect(onToggle).toHaveBeenCalledWith("urbanisation");
});

test("shows em dash when r2 is null", () => {
  render(
    <ControlPanel factors={factors} selected={new Set()} onToggleFactor={() => {}}
      mode="raw" onSetMode={() => {}} r2={null} n={0} />,
  );
  expect(screen.getByTestId("r2-readout")).toHaveTextContent("—");
});

test("clicking a mode button reports the new mode", () => {
  const onSetMode = vi.fn();
  render(
    <ControlPanel factors={factors} selected={new Set()} onToggleFactor={() => {}}
      mode="residual" onSetMode={onSetMode} r2={null} n={0} />,
  );
  fireEvent.click(screen.getByText("Raw fertility"));
  expect(onSetMode).toHaveBeenCalledWith("raw");
});

test("shows an experimental badge for Possibility-group factors", () => {
  const withPoss: FactorMeta[] = [
    ...factors,
    { id: "possibility", label: "Possibility index", group: "Possibility", unit: "z", direction: "negative", source: "computed" },
  ];
  render(
    <ControlPanel factors={withPoss} selected={new Set()} onToggleFactor={() => {}}
      mode="residual" onSetMode={() => {}} r2={null} n={0} />,
  );
  expect(screen.getByText(/^exp$/i)).toBeInTheDocument(); // anchored: avoid matching "Unexplained"
});

test("renders a pronatalist-policy toggle when onSetPolicy is provided", () => {
  const onSetPolicy = vi.fn();
  render(
    <ControlPanel factors={[]} selected={new Set()} onToggleFactor={() => {}}
      mode="residual" onSetMode={() => {}} r2={null} n={0}
      policyOn={false} onSetPolicy={onSetPolicy} />
  );
  const cb = screen.getByLabelText(/pronatalist policy/i);
  fireEvent.click(cb);
  expect(onSetPolicy).toHaveBeenCalledWith(true);
});

test("no policy toggle when onSetPolicy is omitted", () => {
  render(
    <ControlPanel factors={[]} selected={new Set()} onToggleFactor={() => {}}
      mode="residual" onSetMode={() => {}} r2={null} n={0} />
  );
  expect(screen.queryByLabelText(/pronatalist policy/i)).not.toBeInTheDocument();
});

test("annotates logged and curved factors", () => {
  const factors = [
    { id: "gdp_pc", label: "GDP per capita", group: "Economic", unit: "$", direction: "negative", source: "WB", transform: "log", quadratic: false },
    { id: "possibility", label: "Possibility index", group: "Possibility", unit: "z", direction: "negative", source: "computed", transform: "raw", quadratic: true },
  ];
  render(
    <ControlPanel factors={factors as any} selected={new Set()} onToggleFactor={() => {}}
      mode="residual" onSetMode={() => {}} r2={null} n={0} />
  );
  expect(screen.getByText(/\(log\)/)).toBeInTheDocument();
  expect(screen.getByText("curve")).toBeInTheDocument();
});
