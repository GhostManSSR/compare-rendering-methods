PYTHON ?= python3
VENV ?= ml_app/.venv
VENV_PYTHON = $(VENV)/bin/python
VENV_STAMP = $(VENV)/.requirements-installed
NETWORK_PROFILES ?= fast-4g,regular-4g,slow-3g
WORKLOADS ?= light,medium,heavy

.PHONY: install test test-matrix test-smoke run

install: $(VENV_STAMP)

$(VENV_STAMP): ml_app/requirements.txt
	$(PYTHON) -m venv $(VENV)
	$(VENV_PYTHON) -m pip install -r ml_app/requirements.txt
	touch $(VENV_STAMP)

test: test-matrix

test-matrix: install
	LCP_TEST_NETWORK_PROFILES="$(NETWORK_PROFILES)" \
	LCP_TEST_WORKLOADS="$(WORKLOADS)" \
	$(VENV_PYTHON) -m unittest discover -s ml_app -p 'test_*.py' -v

test-smoke:
	$(MAKE) test-matrix NETWORK_PROFILES=fast-4g WORKLOADS=light

run: install
	$(VENV_PYTHON) -m streamlit run ml_app/streamlit_app.py
