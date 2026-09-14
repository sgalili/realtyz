# Google Accounts UI Update

## Changes
- Replace the Google section status pill with the connected account email and add Gmail, Calendar, and YouTube logos to the section header; connected services stay colored and disconnected services appear grayscale.
- Reorder each service card to show its title, connected email, and explanation, with a dedicated concise Gmail usage line.
- Remove reconnect from the default state. Connected cards show the status in that action position, while disconnected cards show the connect action only after an explicit confirmed disconnect.
- Keep the existing unlink confirmation control for connected services.
- Place the Client ID and secret form inside a collapsed “הגדרות גוגל למתקדמים” section available to super administrators.

## Technical details
- Reuse the existing persistent connection cache and database status so temporary loading failures do not expose connect actions.
- Track explicit disconnect state per Google service and clear it again after successful OAuth connection.
- Extend the shared connections section header to accept custom account email and service-logo content without changing other connection sections.
- Verify the connections page at mobile and desktop widths and run the focused TypeScript check.
