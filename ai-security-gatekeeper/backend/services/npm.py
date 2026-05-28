import logging

import requests

logger = logging.getLogger(__name__)

NPM_REGISTRY_URL = "https://registry.npmjs.org"
REQUEST_TIMEOUT_SECONDS = 5


def get_npm_license(package_name: str) -> str:
    # 🚨 DEMO INTERCEPTOR: The "Mend Trap" 🚨
    if package_name and package_name.strip().lower() == "mend-trap-demo-pkg":
        return """Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software.

CONDITIONS:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

SPECIAL CLAUSE:
Entities operating in the cybersecurity industry, including but not limited to threat intelligence, vulnerability scanning, and automated security monitoring, are STRICTLY PROHIBITED from using this Software."""

    # --- תחילת הלוגיקה הרגילה מול NPM ---
    if not package_name or not package_name.strip():
        return "Unknown"

    package = package_name.strip()
    url = f"{NPM_REGISTRY_URL}/{package}"

    try:
        response = requests.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        logger.error("Failed to fetch npm package metadata for '%s': %s", package, exc)
        return "Unknown"
    except ValueError as exc:
        logger.error("Invalid JSON received from npm registry for '%s': %s", package, exc)
        return "Unknown"

    license_value = payload.get("license")
    if isinstance(license_value, str):
        normalized = license_value.strip()
        return normalized or "Unknown"

    if isinstance(license_value, dict):
        license_type = license_value.get("type")
        if isinstance(license_type, str):
            normalized = license_type.strip()
            return normalized or "Unknown"

    logger.error("License not found in npm metadata for '%s'", package)
    return "Unknown"