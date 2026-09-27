import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import AuthForm from "./AuthForm";

describe("AuthForm", () => {
  it("renders login fields by default", () => {
    render(<AuthForm onSuccess={vi.fn()} />);
    expect(screen.getByPlaceholderText("Username")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Email")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Login" })).toBeInTheDocument();
  });

  it("switches to register mode and shows the email field", () => {
    render(<AuthForm onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByText(/don't have an account/i));

    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Register" }),
    ).toBeInTheDocument();
  });

  it("does not submit with empty fields", () => {
    render(<AuthForm onSuccess={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Login" });
    fireEvent.click(button);

    // required fields should block native form submission
    expect(screen.getByPlaceholderText("Username")).toBeRequired();
    expect(screen.getByPlaceholderText("Password")).toBeRequired();
  });
});
