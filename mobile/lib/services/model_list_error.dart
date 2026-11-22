class ModelListHttpError implements Exception {
  final int status;
  const ModelListHttpError(this.status);
  @override
  String toString() => 'Model detection failed (HTTP $status)';
}

/// Distinguishes a reachable server with an incompatible payload from a
/// connection failure. Never copy the upstream body into user-facing errors.
class ModelListFormatError extends FormatException {
  const ModelListFormatError() : super('Invalid model list response');
}
