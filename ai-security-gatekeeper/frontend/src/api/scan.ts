import { api } from "./client";
import type { ScanResponse } from "../types/api";

export async function scanPackage(packageName: string): Promise<ScanResponse> {
  const { data } = await api.post<ScanResponse>("/api/scan", {
    package_name: packageName,
  });
  return data;
}
