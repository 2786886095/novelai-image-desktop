Public, neutral loopback TEST-ONLY certificates and keys. Not used by shipped application code.
The server presents a one-year serverAuth leaf plus its root; client trust is restricted to this root.
Desktop tests pass this PEM bundle as their only trusted CA list.
Never disable certificate validation.
