function guess37Contract(terms, inviteMaker){
    const seat = harden({
        guess(attempt) {
            return attempt === 37 ? 'you win' : 'you lose';
        }
    });

    return harden({
        playerInvite: inviteMaker.make('player', seat)
    });
}

export default guess37Contract.toString()