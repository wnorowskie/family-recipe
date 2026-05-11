"""
Unit tests for error response helpers.
"""

from src.errors import (
    bad_request,
    conflict,
    error_response,
    forbidden,
    internal_error,
    invalid_credentials,
    invalid_tag,
    not_found,
    too_many_photos,
    unauthorized,
    unsupported_file_type,
    validation_error,
)


class TestErrorResponse:
    def test_error_response_structure(self):
        """error_response should return JSONResponse with correct structure."""
        response = error_response("TEST_CODE", "Test message", 400)
        
        assert response.status_code == 400
        # The body is JSON with error.code and error.message
        import json
        body = json.loads(response.body)
        assert "error" in body
        assert body["error"]["code"] == "TEST_CODE"
        assert body["error"]["message"] == "Test message"


class TestErrorHelpers:
    def test_validation_error(self):
        """validation_error should return 400 with VALIDATION_ERROR code."""
        response = validation_error("Invalid field")
        assert response.status_code == 400
        import json
        body = json.loads(response.body)
        assert body["error"]["code"] == "VALIDATION_ERROR"

    def test_bad_request(self):
        """bad_request should return 400 with BAD_REQUEST code."""
        response = bad_request("Bad input")
        assert response.status_code == 400
        import json
        body = json.loads(response.body)
        assert body["error"]["code"] == "BAD_REQUEST"

    def test_unauthorized(self):
        """unauthorized should return 401 with UNAUTHORIZED code."""
        response = unauthorized()
        assert response.status_code == 401
        import json
        body = json.loads(response.body)
        assert body["error"]["code"] == "UNAUTHORIZED"

    def test_invalid_credentials(self):
        """invalid_credentials should return 401 with INVALID_CREDENTIALS code."""
        response = invalid_credentials()
        assert response.status_code == 401
        import json
        body = json.loads(response.body)
        assert body["error"]["code"] == "INVALID_CREDENTIALS"

    def test_forbidden(self):
        """forbidden should return 403 with FORBIDDEN code."""
        response = forbidden("Not allowed")
        assert response.status_code == 403
        import json
        body = json.loads(response.body)
        assert body["error"]["code"] == "FORBIDDEN"

    def test_not_found(self):
        """not_found should return 404 with NOT_FOUND code."""
        response = not_found("Resource missing")
        assert response.status_code == 404
        import json
        body = json.loads(response.body)
        assert body["error"]["code"] == "NOT_FOUND"

    def test_conflict(self):
        """conflict should return 409 with CONFLICT code."""
        response = conflict("Already exists")
        assert response.status_code == 409
        import json
        body = json.loads(response.body)
        assert body["error"]["code"] == "CONFLICT"

    def test_internal_error(self):
        """internal_error should return 500 with INTERNAL_ERROR code."""
        response = internal_error("Something broke")
        assert response.status_code == 500
        import json
        body = json.loads(response.body)
        assert body["error"]["code"] == "INTERNAL_ERROR"

    def test_too_many_photos(self):
        """too_many_photos should return 400 with TOO_MANY_PHOTOS code."""
        response = too_many_photos("Upload up to 10 photos")
        assert response.status_code == 400
        import json
        body = json.loads(response.body)
        assert body["error"]["code"] == "TOO_MANY_PHOTOS"
        assert body["error"]["message"] == "Upload up to 10 photos"

    def test_unsupported_file_type(self):
        """unsupported_file_type should return 400 with UNSUPPORTED_FILE_TYPE code."""
        response = unsupported_file_type("Only JPEG/PNG/WEBP/GIF allowed")
        assert response.status_code == 400
        import json
        body = json.loads(response.body)
        assert body["error"]["code"] == "UNSUPPORTED_FILE_TYPE"
        assert body["error"]["message"] == "Only JPEG/PNG/WEBP/GIF allowed"

    def test_invalid_tag(self):
        """invalid_tag should return 400 with INVALID_TAG code."""
        response = invalid_tag()
        assert response.status_code == 400
        import json
        body = json.loads(response.body)
        assert body["error"]["code"] == "INVALID_TAG"
        # Default message comes from the helper.
        assert "not available" in body["error"]["message"].lower()
