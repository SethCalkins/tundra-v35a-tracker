"use server";

import { revalidatePath } from "next/cache";

import { query } from "@/lib/db";

export async function markVerified(id: number, method: string = "admin"): Promise<void> {
  await query(
    `UPDATE user_submissions
        SET verified = 1, verified_at = ?, verification_method = ?
      WHERE id = ?`,
    [new Date().toISOString(), method, id],
  );
  revalidatePath("/admin");
  revalidatePath("/lifespan");
  revalidatePath("/submit");
  revalidatePath("/");
}

export async function markUnverified(id: number): Promise<void> {
  await query(
    `UPDATE user_submissions
        SET verified = 0, verified_at = NULL, verification_method = NULL
      WHERE id = ?`,
    [id],
  );
  revalidatePath("/admin");
  revalidatePath("/lifespan");
  revalidatePath("/submit");
  revalidatePath("/");
}

export async function deleteSubmission(id: number): Promise<void> {
  await query(`DELETE FROM user_submissions WHERE id = ?`, [id]);
  revalidatePath("/admin");
  revalidatePath("/lifespan");
  revalidatePath("/submit");
  revalidatePath("/");
}
