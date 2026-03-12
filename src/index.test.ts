import { describe, expect, it } from "vitest";

import { chunk, clamp, uniqueBy } from "./index";

describe("clamp", () => {
	it("returns the lower bound when the value is below the range", () => {
		expect(clamp(-5, { min: 0, max: 10 })).toBe(0);
	});

	it("returns the upper bound when the value is above the range", () => {
		expect(clamp(20, { min: 0, max: 10 })).toBe(10);
	});

	it("throws when the range is invalid", () => {
		expect(() => clamp(5, { min: 10, max: 0 })).toThrow(RangeError);
	});
});

describe("chunk", () => {
	it("splits an array into evenly sized chunks", () => {
		expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
	});

	it("throws when the chunk size is not a positive integer", () => {
		expect(() => chunk([1, 2, 3], 0)).toThrow(RangeError);
	});
});

describe("uniqueBy", () => {
	it("keeps the first item for each computed key", () => {
		const items = [
			{ id: "a", value: 1 },
			{ id: "b", value: 1 },
			{ id: "c", value: 2 },
		];

		expect(uniqueBy(items, (item) => item.value)).toEqual([
			{ id: "a", value: 1 },
			{ id: "c", value: 2 },
		]);
	});
});
