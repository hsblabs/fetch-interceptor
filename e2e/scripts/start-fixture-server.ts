import { startFixtureServer } from "../src/fixture-server";

const port = Number(process.env.PORT ?? "4173");
const fixtureServer = await startFixtureServer(port);

console.log(`Fixture server listening on ${fixtureServer.origin}`);

const shutdown = async () => {
	await fixtureServer.close();
	process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await new Promise(() => {});
