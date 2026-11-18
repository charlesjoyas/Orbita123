// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { seedData } from "../data/seed";
import { useStore } from "../store";
import { connectRemote, stopRemote } from "./remote";
import { useIdentity, type Account } from "./session";

afterEach(() => {
  stopRemote();
  useIdentity.setState({ user: null, ready: false, expired: false });
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("descarta una consulta antigua si se guardó un cambio mientras estaba en vuelo", async () => {
  vi.useFakeTimers();
  const data = seedData();
  const user: Account = { ...data.members[0], email: "admin@orbita.test", role: "admin", active: true };
  let respond!: (response: Response) => void;
  const stale = new Promise<Response>((resolve) => { respond = resolve; });
  const fetcher = vi.fn((_input: string, options: RequestInit) =>
    options.method === "GET" ? stale : Promise.resolve(Response.json({ revision: 3 })),
  );
  vi.stubGlobal("fetch", fetcher);
  useIdentity.setState({ user });
  connectRemote(data, 1, user);
  await vi.advanceTimersByTimeAsync(7_000);
  useStore.getState().addTask(data.boards[0].id, data.boards[0].columns[0].id, "Cambio local");
  await vi.advanceTimersByTimeAsync(0);
  respond(Response.json({ data, user, revision: 2 }));
  await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(useStore.getState().data.tasks.some((task) => task.title === "Cambio local")).toBe(true);
});
