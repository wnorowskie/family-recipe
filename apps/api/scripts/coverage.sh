#!/bin/bash
# FastAPI Test Coverage Script
# Usage: ./scripts/coverage.sh [options]
#
# Options:
#   --html      Generate HTML report and open in browser
#   --xml       Generate XML report (for CI)
#   --unit      Run only unit tests
#   --all       Run all tests including integration
#   --fail=N    Fail if coverage is below N percent

set -e

cd "$(dirname "$0")/.."

# Activate virtual environment if not already active
if [[ -z "$VIRTUAL_ENV" ]]; then
    source .venv/bin/activate
fi

# Default options
COVERAGE_OPTS="--cov=src --cov-config=.coveragerc"
TEST_PATH="tests/unit"
REPORT_TYPE="term"
FAIL_UNDER=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --html)
            REPORT_TYPE="html"
            shift
            ;;
        --xml)
            REPORT_TYPE="xml"
            shift
            ;;
        --unit)
            TEST_PATH="tests/unit"
            shift
            ;;
        --all)
            TEST_PATH="tests"
            shift
            ;;
        --fail=*)
            FAIL_UNDER="${1#*=}"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Build pytest command
CMD="python -m pytest $TEST_PATH $COVERAGE_OPTS"

case $REPORT_TYPE in
    html)
        CMD="$CMD --cov-report=html --cov-report=term"
        ;;
    xml)
        CMD="$CMD --cov-report=xml --cov-report=term"
        ;;
    term)
        CMD="$CMD --cov-report=term-missing"
        ;;
esac

if [[ -n "$FAIL_UNDER" ]]; then
    CMD="$CMD --cov-fail-under=$FAIL_UNDER"
fi

echo "Running: $CMD"
echo "----------------------------------------"
$CMD

# Open HTML report if generated
if [[ "$REPORT_TYPE" == "html" ]]; then
    echo ""
    echo "Opening coverage report..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        open htmlcov/index.html
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        xdg-open htmlcov/index.html
    fi
fi
