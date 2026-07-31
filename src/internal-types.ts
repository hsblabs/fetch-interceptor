import type { FetchInterceptorOptions } from "./types";

export type ResolvedInterceptorOptions = Readonly<
	Omit<FetchInterceptorOptions, "matcher"> & {
		matcher: NonNullable<FetchInterceptorOptions["matcher"]>;
	}
>;
