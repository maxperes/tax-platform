import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, signOut, type AdminUserListItem } from "../api";
import { LoadingShell } from "../components/LoadingShell";

type UserStatus = "pending" | "approved" | "rejected";

const STATUS_FILTERS: { value: UserStatus | "all"; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" }
];

export function AdminUsersPage() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("pending");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const queryPath =
    statusFilter === "all" ? "/api/admin/users" : `/api/admin/users?status=${statusFilter}`;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-users", statusFilter],
    queryFn: () => api<{ users: AdminUserListItem[] }>(queryPath)
  });

  const users = data?.users ?? [];

  async function runAction(userId: string, action: "approve" | "reject" | { isAdmin: boolean }) {
    setActionError(null);
    setActingOn(userId);
    try {
      if (action === "approve") {
        await api(`/api/admin/users/${userId}/approve`, { method: "POST" });
      } else if (action === "reject") {
        await api(`/api/admin/users/${userId}/reject`, { method: "POST" });
      } else {
        await api(`/api/admin/users/${userId}`, {
          method: "PATCH",
          body: JSON.stringify({ isAdmin: action.isAdmin })
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActingOn(null);
    }
  }

  function handleSignOut() {
    signOut();
    nav("/login", { replace: true });
  }

  if (isLoading) {
    return <LoadingShell message="Loading users…" />;
  }

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold mb-1">User approvals</h1>
            <p className="text-slate-400 text-sm">Review registration requests and manage access.</p>
          </div>
          <Link
            to="/sessions"
            className="text-sm text-emerald-400 hover:underline"
          >
            Tax intake
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                statusFilter === filter.value
                  ? "bg-emerald-600 text-white"
                  : "border border-slate-700 text-slate-300 hover:border-emerald-600"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {isError && (
          <div className="rounded-lg border border-rose-800/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
            <p>Could not load users.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-2 text-emerald-400 hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {actionError && <p className="text-sm text-red-400">{actionError}</p>}

        {users.length === 0 ? (
          <p className="text-sm text-slate-400">No users in this category.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-950/80 text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Admin</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-slate-800">
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3 capitalize">{user.status}</td>
                    <td className="px-4 py-3">{user.isAdmin ? "Yes" : "No"}</td>
                    <td className="px-4 py-3 text-slate-400">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {user.status === "pending" && (
                          <>
                            <button
                              type="button"
                              disabled={actingOn === user.id}
                              onClick={() => void runAction(user.id, "approve")}
                              className="rounded bg-emerald-600 px-2 py-1 text-xs hover:bg-emerald-500 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={actingOn === user.id}
                              onClick={() => void runAction(user.id, "reject")}
                              className="rounded border border-rose-700 px-2 py-1 text-xs text-rose-300 hover:bg-rose-950 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {user.status === "rejected" && (
                          <button
                            type="button"
                            disabled={actingOn === user.id}
                            onClick={() => void runAction(user.id, "approve")}
                            className="rounded bg-emerald-600 px-2 py-1 text-xs hover:bg-emerald-500 disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={actingOn === user.id}
                          onClick={() => void runAction(user.id, { isAdmin: !user.isAdmin })}
                          className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:border-emerald-600 disabled:opacity-50"
                        >
                          {user.isAdmin ? "Remove admin" : "Make admin"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex gap-3 pt-2 border-t border-slate-800 text-sm">
          <button type="button" onClick={handleSignOut} className="text-slate-400 hover:text-slate-200">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
