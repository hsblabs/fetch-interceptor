export function throwCollectedErrors(
	message: string,
	errors: readonly unknown[],
): void {
	if (errors.length === 0) {
		return;
	}

	if (errors.length === 1) {
		throw errors[0];
	}

	throw new AggregateError(errors, message);
}
