import { render, screen } from "@testing-library/react";
import { Legend } from "./Legend";

test("residual legend shows directional labels", () => {
  render(<Legend mode="residual" />);
  expect(screen.getByText(/lower than expected/i)).toBeInTheDocument();
  expect(screen.getByText(/higher than expected/i)).toBeInTheDocument();
});

test("raw legend shows numeric bounds", () => {
  render(<Legend mode="raw" />);
  expect(screen.getByText("7+")).toBeInTheDocument();
});
