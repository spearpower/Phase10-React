'use client';
import { api } from '@/lib/client';

export default function SignOutButton() {
	return (
		<button type="button" onClick={async () => { await api('/api/auth/signout', {}); window.location.href = '/signin'; }}>
			Sign Out
		</button>
	);
}
