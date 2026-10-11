Public, neutral loopback TEST-ONLY certificates and keys. Not used by shipped application code.
The server presents a one-year serverAuth leaf plus its root; client trust is restricted to this root.
PEM bundles work on desktop/Android, while iOS accepts one DER certificate per call.
Never disable certificate validation.
