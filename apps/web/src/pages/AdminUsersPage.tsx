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
      <div className="mx-auto max-w-4xl rounded-2xl border border-surface-border bg-white p-8 shadow-xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold mb-1">User approvals</h1>
            <p className="text-navy-700/75 text-sm">Review registration requests and manage access.</p>
          </div>
          <Link
            to="/sessions"
            className="text-sm text-accent-dark hover:underline"
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
              className={`rounded-full px-3 py-1.5 text-sm ${
                statusFilter === filter.value
                  ? "bg-accent text-white"
                  : "border border-surface-border text-navy-700 hover:border-accent"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {isError && (
          <div className="rounded-lg border border-alertRed/30 bg-alertRed-light px-4 py-3 text-sm text-alertRed">
            <p>Could not load users.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-2 text-accent-dark hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {actionError && <p className="text-sm text-alertRed">{actionError}</p>}

        {users.length === 0 ? (
          <p className="text-sm text-navy-700/75">No users in this category.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-surface-border">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-muted text-navy-700/75">
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
                  <tr key={user.id} className="border-t border-surface-border">
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3 capitalize">{user.status}</td>
                    <td className="px-4 py-3">{user.isAdmin ? "Yes" : "No"}</td>
                    <td className="px-4 py-3 text-navy-700/75">
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
                              className="rounded-full bg-accent px-2 py-1 text-xs text-white hover:bg-accent-dark disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={actingOn === user.id}
                              onClick={() => void runAction(user.id, "reject")}
                              className="rounded-full border border-alertRed/40 px-2 py-1 text-xs text-alertRed hover:bg-alertRed-light disabled:opacity-50"
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
                            className="rounded-full bg-accent px-2 py-1 text-xs text-white hover:bg-accent-dark disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={actingOn === user.id}
                          onClick={() => void runAction(user.id, { isAdmin: !user.isAdmin })}
                          className="rounded border border-surface-border px-2 py-1 text-xs text-navy-700 hover:border-accent disabled:opacity-50"
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

        <div className="flex gap-3 pt-2 border-t border-surface-border text-sm">
          <button type="button" onClick={handleSignOut} className="text-navy-700/75 hover:text-navy">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
