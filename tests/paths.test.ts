import { afterEach, describe, expect, it, vi } from "vitest";
import { isCurrentSection, stripBase, withBase } from "../src/lib/paths";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("withBase", () => {
  it("leaves a root-relative path alone when the base is /", () => {
    expect(withBase("/meetings", "/")).toBe("/meetings");
  });

  it("prefixes a base that ends in a slash without doubling it", () => {
    expect(withBase("/meetings", "/arlingtonview.org/")).toBe("/arlingtonview.org/meetings");
  });

  it("prefixes a base that has no trailing slash without dropping one", () => {
    expect(withBase("/meetings", "/arlingtonview.org")).toBe("/arlingtonview.org/meetings");
  });

  it("maps the home path to the base itself, with a trailing slash", () => {
    expect(withBase("/", "/")).toBe("/");
    expect(withBase("/", "/arlingtonview.org/")).toBe("/arlingtonview.org/");
    expect(withBase("/", "/arlingtonview.org")).toBe("/arlingtonview.org/");
  });

  it("keeps nested paths, file names, and fragments intact", () => {
    expect(withBase("/about/history", "/arlingtonview.org/")).toBe("/arlingtonview.org/about/history");
    expect(withBase("/favicon.svg", "/arlingtonview.org")).toBe("/arlingtonview.org/favicon.svg");
    expect(withBase("/documents#bylaws", "/arlingtonview.org/")).toBe("/arlingtonview.org/documents#bylaws");
  });

  it("leaves a trailing slash alone and never adds one", () => {
    expect(withBase("/meetings/", "/")).toBe("/meetings/");
    expect(withBase("/meetings/", "/arlingtonview.org/")).toBe("/arlingtonview.org/meetings/");
    expect(withBase("/meetings/", "/arlingtonview.org")).toBe("/arlingtonview.org/meetings/");
    expect(withBase("/about/history/", "/arlingtonview.org")).toBe("/arlingtonview.org/about/history/");
    expect(withBase("/documents/#bylaws", "/arlingtonview.org/")).toBe("/arlingtonview.org/documents/#bylaws");
    expect(withBase("/meetings/#past", "/")).toBe("/meetings/#past");
    expect(withBase("/meetings", "/")).toBe("/meetings");
  });

  it("treats a path without a leading slash as root-relative", () => {
    expect(withBase("meetings", "/")).toBe("/meetings");
    expect(withBase("meetings", "/arlingtonview.org/")).toBe("/arlingtonview.org/meetings");
  });

  it("reads the base from import.meta.env.BASE_URL by default", () => {
    vi.stubEnv("BASE_URL", "/arlingtonview.org/");
    expect(withBase("/join")).toBe("/arlingtonview.org/join");
    vi.stubEnv("BASE_URL", "/arlingtonview.org");
    expect(withBase("/join")).toBe("/arlingtonview.org/join");
    vi.stubEnv("BASE_URL", "/");
    expect(withBase("/join")).toBe("/join");
  });
});

describe("stripBase", () => {
  it("removes the base and returns the trailing-slash form the site links to", () => {
    expect(stripBase("/arlingtonview.org/about/history/", "/arlingtonview.org/")).toBe("/about/history/");
    expect(stripBase("/arlingtonview.org/about", "/arlingtonview.org")).toBe("/about/");
    expect(stripBase("/about/", "/")).toBe("/about/");
    expect(stripBase("/about", "/")).toBe("/about/");
  });

  it("leaves a file path without a trailing slash", () => {
    expect(stripBase("/404.html", "/")).toBe("/404.html");
    expect(stripBase("/arlingtonview.org/404.html", "/arlingtonview.org/")).toBe("/404.html");
  });

  it("returns / for the home page under any base", () => {
    expect(stripBase("/", "/")).toBe("/");
    expect(stripBase("/arlingtonview.org/", "/arlingtonview.org/")).toBe("/");
    expect(stripBase("/arlingtonview.org", "/arlingtonview.org/")).toBe("/");
  });

  it("does not strip a base that only matches part of a segment", () => {
    expect(stripBase("/arlingtonview.organic/about", "/arlingtonview.org")).toBe("/arlingtonview.organic/about/");
  });
});

describe("isCurrentSection", () => {
  it("matches the route itself, however either side spells the trailing slash", () => {
    expect(isCurrentSection("/about/", "/about/", "/")).toBe(true);
    expect(isCurrentSection("/about", "/about/", "/")).toBe(true);
    expect(isCurrentSection("/about/", "/about", "/")).toBe(true);
    expect(isCurrentSection("/about", "/about", "/")).toBe(true);
  });

  it("matches pages beneath the route", () => {
    expect(isCurrentSection("/about/history/", "/about/", "/")).toBe(true);
    expect(isCurrentSection("/about/history", "/about/", "/")).toBe(true);
    expect(isCurrentSection("/arlingtonview.org/about/history/", "/about/", "/arlingtonview.org/")).toBe(true);
    expect(isCurrentSection("/arlingtonview.org/about/history/", "/about/", "/arlingtonview.org")).toBe(true);
  });

  it("does not match a sibling route that shares a prefix", () => {
    expect(isCurrentSection("/about-us/", "/about/", "/")).toBe(false);
    expect(isCurrentSection("/meetings/", "/about/", "/")).toBe(false);
  });

  it("does not mark any section on the home page", () => {
    expect(isCurrentSection("/", "/about/", "/")).toBe(false);
    expect(isCurrentSection("/arlingtonview.org/", "/meetings/", "/arlingtonview.org/")).toBe(false);
  });

  it("treats the home route as matching the home page only", () => {
    expect(isCurrentSection("/", "/", "/")).toBe(true);
    expect(isCurrentSection("/arlingtonview.org/", "/", "/arlingtonview.org")).toBe(true);
    expect(isCurrentSection("/about/", "/", "/")).toBe(false);
  });
});
