// Defense in depth for generic error handlers. The importer itself never logs request/response data.
const secrets=new Set<string>();
export function rememberRelaySecret(value:string){if(value)secrets.add(value);}
export function redactRelayImportSecrets(value:string):string {
  let safe=value.replace(/langbai-novelai:[^\s"'<>]*/gi,'[relay-import-link]');
  for(const secret of secrets)safe=safe.replaceAll(secret,'[redacted]');
  return safe;
}
