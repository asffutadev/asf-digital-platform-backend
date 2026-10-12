import * as repo from "./fsSessions.repository.js";

export async function getSessions() {
  return repo.listSessions();
}