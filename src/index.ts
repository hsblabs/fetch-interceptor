export interface ClampRange {
	min: number;
	max: number;
}

export const clamp = (value: number, range: ClampRange): number => {
	if (range.min > range.max) {
		throw new RangeError("range.min must be less than or equal to range.max");
	}

	return Math.min(Math.max(value, range.min), range.max);
};

export const chunk = <T>(items: readonly T[], size: number): T[][] => {
	if (!Number.isInteger(size) || size < 1) {
		throw new RangeError("size must be a positive integer");
	}

	const result: T[][] = [];

	for (let index = 0; index < items.length; index += size) {
		result.push(items.slice(index, index + size));
	}

	return result;
};

export const uniqueBy = <T, Key>(
	items: readonly T[],
	getKey: (item: T) => Key,
): T[] => {
	const seen = new Set<Key>();
	const result: T[] = [];

	for (const item of items) {
		const key = getKey(item);

		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		result.push(item);
	}

	return result;
};
