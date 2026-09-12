import { Notice } from '../components/notice.js';
import { ApiClient, messageOf } from '../core/api-client.js';
import { whileBusy } from '../core/busy.js';
import { byId } from '../core/dom.js';
import { ENDPOINTS } from '../config.js';

/** Where to go after signing in: a path on this server, never an address from the query string. */
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get('next');
  return next !== null && next.startsWith('/') && !next.startsWith('//') ? next : '/console';
}

// Composition root for the sign-in page. A wrong token is a 401 here, and that
// must be shown, not answered by sending the person back to this same page.
const http = new ApiClient(() => {});
const notice = new Notice();
const form = byId<HTMLFormElement>('form');
const button = byId<HTMLButtonElement>('go');
const token = byId<HTMLInputElement>('token');
byId('formNote').append(notice.element);

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void whileBusy(button, 'Signing in...', async () => {
    try {
      await http.request('POST', ENDPOINTS.login, { body: { token: token.value } });
      window.location.href = nextPath();
    } catch (error) {
      notice.show('err', messageOf(error));
    }
  });
});
