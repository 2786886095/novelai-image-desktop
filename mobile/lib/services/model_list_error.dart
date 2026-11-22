class ModelListHttpError implements Exception {
  final int status;
  const ModelListHttpError(this.status);
  @override
  String toString() => 'Model detection failed (HTTP $status)';
}
