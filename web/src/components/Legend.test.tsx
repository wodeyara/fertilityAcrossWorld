import { render, screen } from "@testing-library/react";
import { Legend } from "./Legend";

test("residual legend shows fixed numeric ticks", () => {
  render(<Legend mode="residual" />);
  expect(screen.getByText("≤ -0.5")).toBeInTheDocument();
  expect(screen.getByText("≥ +0.5")).toBeInTheDocument();
  expect(screen.getByText("0")).toBeInTheDocument();
});

test("raw legend shows numeric bounds", () => {
  render(<Legend mode="raw" />);
  expect(screen.getByText("7+")).toBeInTheDocument();
});

test("raw legend shows the lower numeric bound", () => {
  render(<Legend mode="raw" />);
  expect(screen.getByText("0.8")).toBeInTheDocument();
});

test("shows a pronatalist-policy swatch when policyOn", () => {
  render(<Legend mode="residual" policyOn />);
  expect(screen.getByText(/pronatalist policy/i)).toBeInTheDocument();
});

test("no policy swatch when policyOn is false", () => {
  render(<Legend mode="residual" />);
  expect(screen.queryByText(/pronatalist policy/i)).not.toBeInTheDocument();
});
