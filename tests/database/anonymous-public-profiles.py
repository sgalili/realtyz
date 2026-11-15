"""Read-only guest access checks against the configured project."""
import os
from pathlib import Path
import requests

config = {}
for line in Path('.env').read_text().splitlines():
    if '=' in line and not line.startswith('#'):
        key, value = line.split('=', 1)
        config[key] = value.strip().strip('"').strip("'")
url = os.environ.get('VITE_SUPABASE_URL') or config['VITE_SUPABASE_URL']
key = os.environ.get('VITE_SUPABASE_PUBLISHABLE_KEY') or config['VITE_SUPABASE_PUBLISHABLE_KEY']
headers = {'apikey': key, 'Authorization': f'Bearer {key}'}

def rpc(name, payload):
    response = requests.post(f'{url}/rest/v1/rpc/{name}', headers=headers, json=payload, timeout=40)
    assert response.status_code == 200, f'{name}: HTTP {response.status_code}'
    return response.json()

broker = '1ca89c52-2163-4fe0-9ec1-3d27795b6232'
private = 'dc819834-1aa9-4aca-bb27-ec2c8cebde69'
profile = rpc('community_profile_page', {'_user': broker})
assert len(profile) == 1 and profile[0]['full_name'] == 'דולי אידלסון'
assert not {'phone', 'phone_number', 'email', 'workspace_owner_id'} & profile[0].keys()
members = rpc('community_office_members', {'_user': broker})
assert len(members) == 5
assert rpc('community_office_roster_size', {'_user': broker}) == 5
office = rpc('community_office_details', {'_user': broker})[0]
assert office['description']
assert office['address'] == 'אורי צבי גרינברג 20', office['address']
assert 'address' not in profile[0], 'office address leaked to the broker profile RPC'
assert rpc('community_profile_page', {'_user': private}) == []
assert rpc('community_profile_listings', {'_user': private}) == []
for name in ['profile_management_access', 'community_directory']:
    payload = {'_user': broker} if name == 'profile_management_access' else {}
    response = requests.post(f'{url}/rest/v1/rpc/{name}', headers=headers, json=payload, timeout=40)
    assert response.status_code in (401, 403), f'{name} allowed anonymous access'
print('Guest profile, five-member roster, description, private-profile denial and protected RPC checks passed.')