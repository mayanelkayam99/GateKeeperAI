"""
Run this test file (Git Bash):

    pytest backend/tests/test_npm_service.py -q
"""

from unittest.mock import Mock, patch

import requests

from backend.services.npm import get_npm_license


def test_get_license_string_format():
    mock_response = Mock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {"license": "MIT"}

    with patch("backend.services.npm.requests.get", return_value=mock_response) as mock_get:
        assert get_npm_license("lodash") == "MIT"
        mock_get.assert_called_once()


def test_get_license_dict_format():
    mock_response = Mock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {"license": {"type": "ISC"}}

    with patch("backend.services.npm.requests.get", return_value=mock_response) as mock_get:
        assert get_npm_license("left-pad") == "ISC"
        mock_get.assert_called_once()


def test_get_license_not_found():
    mock_response = Mock()
    mock_response.raise_for_status.side_effect = requests.HTTPError("404 Not Found")
    mock_response.status_code = 404

    with patch("backend.services.npm.requests.get", return_value=mock_response):
        assert get_npm_license("this-package-should-not-exist") == "Unknown"


def test_get_license_timeout():
    with patch("backend.services.npm.requests.get", side_effect=requests.exceptions.Timeout):
        assert get_npm_license("lodash") == "Unknown"

