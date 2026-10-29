/** Stop waiting without changing permissions or falsely reporting success. */
export function boundedRequest<T>(request: PromiseLike<T>, ms = 15_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('הטעינה נמשכת זמן רב. אפשר לנסות שוב.')), ms);
    Promise.resolve(request).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}