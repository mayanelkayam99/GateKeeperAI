export interface ScanResponse {
  status: "APPROVED" | "WARNING" | "BLOCKED";
  license_type: string;
  cve_summary: string;
  ai_explanation: string;
  alternatives: string[];
}
