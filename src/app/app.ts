import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  readonly title = 'Safe Squad';

  readonly stats = [
    { value: '4.9/5', label: 'nightlife safety rating' },
    { value: '12 sec', label: 'average panic dispatch response' },
    { value: '1 tap', label: 'secure contact alert flow' },
  ];

  readonly features = [
    {
      icon: '◎',
      title: 'Venue geofencing',
      description: 'Auto-detect when your squad leaves the venue or strays beyond the trusted zone.',
    },
    {
      icon: '⚡',
      title: 'Battery drop alerts',
      description: 'Flag low battery before your group gets stuck without a way to reach help.',
    },
    {
      icon: '☎',
      title: 'Fake-call generator',
      description: 'Create a discreet call flow that lets you exit tense situations without awkwardness.',
    },
    {
      icon: '🛡',
      title: 'Private security dispatch',
      description: 'Trigger a connected safety response with one tap when a member needs backup.',
    },
  ];

  readonly squad = [
    { name: 'Mia', status: 'Inside venue', battery: '92%', color: 'lime' },
    { name: 'Jay', status: 'On the move', battery: '68%', color: 'amber' },
    { name: 'Ari', status: 'Low battery', battery: '11%', color: 'red' },
  ];

  readonly actions = [
    'Share location with squad',
    'Send check-in pulse',
    'Activate fake call',
    'Request private escort',
  ];

  readonly pricing = [
    {
      name: 'Free',
      price: '$0',
      description: 'For casual nights and group check-ins.',
      features: ['Up to 4 squad members', 'Basic venue alerts', 'Check-in timer'],
      featured: false,
    },
    {
      name: 'Safety Plus',
      price: '$8/mo',
      description: 'Built for regular nightlife and event organizers.',
      features: ['Unlimited squads', 'Priority security dispatch', 'Battery + movement alerts'],
      featured: true,
    },
  ];
}
